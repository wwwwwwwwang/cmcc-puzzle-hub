import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && serviceRoleKey);

describe.skipIf(!enabled)("request help RPC", () => {
  let admin: SupabaseClient;
  const users: string[] = [];

  beforeAll(() => {
    admin = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    for (const id of users) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("发布求助时托管信用，确认后结算给助力者", async () => {
    const requester = await createApprovedUser(admin, users, 2);
    const helper = await createApprovedUser(admin, users, 0);
    const postId = await publishRequest(admin, requester);

    await expectCredits(admin, requester, 1);
    const { data: helped } = await admin.rpc("help_request_post", {
      p_post_id: postId,
      p_helper: helper,
    });
    expect(helped.status).toBe("HELPED");

    const { data: completed } = await admin.rpc("resolve_request_help", {
      p_post_id: postId,
      p_publisher: requester,
      p_received: true,
    });
    expect(completed).toMatchObject({
      status: "COMPLETED",
      confirmationMethod: "MANUAL",
    });
    await expectCredits(admin, helper, 1);
  });

  it("并发助力只有一个成功者", async () => {
    const requester = await createApprovedUser(admin, users, 1);
    const helperB = await createApprovedUser(admin, users, 0);
    const helperC = await createApprovedUser(admin, users, 0);
    const postId = await publishRequest(admin, requester);

    const results = await Promise.all([
      admin.rpc("help_request_post", { p_post_id: postId, p_helper: helperB }),
      admin.rpc("help_request_post", { p_post_id: postId, p_helper: helperC }),
    ]);

    expect(results.map(({ data }) => data.status).sort()).toEqual([
      "ALREADY_HELPED",
      "HELPED",
    ]);
  });

  it("未收到后重新开放并禁止原助力者重试", async () => {
    const requester = await createApprovedUser(admin, users, 1);
    const helper = await createApprovedUser(admin, users, 0);
    const postId = await publishRequest(admin, requester);

    await admin.rpc("help_request_post", { p_post_id: postId, p_helper: helper });
    const { data: reopened } = await admin.rpc("resolve_request_help", {
      p_post_id: postId,
      p_publisher: requester,
      p_received: false,
    });
    expect(reopened.status).toBe("REOPENED");

    const { data: retried } = await admin.rpc("help_request_post", {
      p_post_id: postId,
      p_helper: helper,
    });
    expect(retried.status).toBe("HELP_RETRY_FORBIDDEN");
  });

  it("维护函数自动确认到期助力且只结算一次", async () => {
    const requester = await createApprovedUser(admin, users, 1);
    const helper = await createApprovedUser(admin, users, 0);
    const postId = await publishRequest(admin, requester);

    await admin.rpc("help_request_post", { p_post_id: postId, p_helper: helper });
    await admin
      .from("request_help_attempts")
      .update({ confirmation_deadline: "2000-01-01T00:00:00.000Z" })
      .eq("post_id", postId);

    await admin.rpc("sync_request_maintenance");
    await admin.rpc("sync_request_maintenance");
    await expectCredits(admin, helper, 1);

    const { data: attempt } = await admin
      .from("request_help_attempts")
      .select("status, confirmation_method")
      .eq("post_id", postId)
      .single();
    expect(attempt).toEqual({ status: "COMPLETED", confirmation_method: "AUTO" });
  });
});

async function createApprovedUser(
  admin: SupabaseClient,
  users: string[],
  credits: number,
) {
  const username = `it-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@puzzle.internal`,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) throw error ?? new Error("创建测试用户失败");
  users.push(data.user.id);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "APPROVED", credits })
    .eq("id", data.user.id);
  if (profileError) throw profileError;
  return data.user.id;
}

async function publishRequest(admin: SupabaseClient, publisherId: string) {
  const source = randomUUID();
  const { data, error } = await admin.rpc("publish_post", {
    p_publisher: publisherId,
    p_type: "REQUEST",
    p_discount: 80,
    p_piece_number: 1,
    p_payloads: { command: `￥${source}￥` },
    p_kinds: ["COMMAND"],
    p_hashes: [source],
    p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  if (error || data.status !== "CREATED") {
    throw error ?? new Error(`发布测试求助失败: ${data.status}`);
  }
  return data.post.id as string;
}

async function expectCredits(
  admin: SupabaseClient,
  userId: string,
  expected: number,
) {
  const { data, error } = await admin
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();
  if (error) throw error;
  expect(data.credits).toBe(expected);
}
