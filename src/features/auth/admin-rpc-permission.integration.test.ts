import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anonKey && serviceRoleKey);

describe.skipIf(!enabled)("管理员 RPC 权限", () => {
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let adminId: string;
  let userId: string;

  beforeAll(async () => {
    admin = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminPassword = randomUUID();
    const adminEmail = `admin-${randomUUID()}@puzzle.internal`;
    const adminResult = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { username: `admin-${randomUUID()}` },
    });
    if (adminResult.error || !adminResult.data.user) {
      throw adminResult.error ?? new Error("创建测试管理员失败");
    }
    adminId = adminResult.data.user.id;
    const { error: adminProfileError } = await admin
      .from("profiles")
      .update({ is_admin: true, status: "APPROVED" })
      .eq("id", adminId);
    if (adminProfileError) throw adminProfileError;

    const userPassword = randomUUID();
    const userEmail = `user-${randomUUID()}@puzzle.internal`;
    const userResult = await admin.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
      user_metadata: { username: `user-${randomUUID()}` },
    });
    if (userResult.error || !userResult.data.user) {
      throw userResult.error ?? new Error("创建测试用户失败");
    }
    userId = userResult.data.user.id;

    user = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await user.auth.signInWithPassword({
      email: userEmail,
      password: userPassword,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    if (adminId) await admin.auth.admin.deleteUser(adminId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("authenticated 客户端不能直接执行管理员 RPC", async () => {
    const { error } = await user.rpc("list_users", {
      p_admin: userId,
      p_status: null,
      p_search: null,
      p_registration_ip: null,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission|权限|not allowed/i);
  });

  it("service role 仍可执行管理员 RPC", async () => {
    const { data, error } = await admin.rpc("list_users", {
      p_admin: adminId,
      p_status: null,
      p_search: null,
      p_registration_ip: null,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).toBeNull();
    expect(data).toEqual(expect.any(Array));
  });
});
