import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import {
  getMyClaimedPosts,
  getMyHelpedPosts,
  getMyPosts,
} from "./user-queries";

function createQuery(data: unknown[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data, error: null });
  return query;
}

function useQueries(queries: Record<string, ReturnType<typeof createQuery>>) {
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    from: vi.fn((table: string) => queries[table]),
  });
}

describe("账户帖子查询", () => {
  beforeEach(() => vi.clearAllMocks());

  it("我的帖子映射托管、关闭原因和待确认信息", async () => {
    const posts = createQuery([
      {
        id: "post-1",
        type: "REQUEST",
        discount: 80,
        piece_number: 2,
        available_payload_kinds: ["COMMAND"],
        status: "PENDING_CONFIRM",
        request_credit_status: "HELD",
        closure_reason: null,
        created_at: "2026-08-06T00:00:00.000Z",
        expires_at: "2026-08-08T00:00:00.000Z",
        request_help_attempts: [
          {
            status: "PENDING",
            confirmation_deadline: "2026-08-07T00:00:00.000Z",
            confirmation_method: null,
          },
        ],
      },
    ]);
    useQueries({ posts });

    await expect(getMyPosts()).resolves.toEqual([
      expect.objectContaining({
        id: "post-1",
        status: "PENDING_CONFIRM",
        requestCreditStatus: "HELD",
        closureReason: null,
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod: null,
      }),
    ]);
  });

  it("我领取的只查询赠送帖", async () => {
    const posts = createQuery([]);
    useQueries({ posts });

    await getMyClaimedPosts();

    expect(posts.eq).toHaveBeenCalledWith("claimant_id", "user-1");
    expect(posts.eq).toHaveBeenCalledWith("type", "GIVE");
  });

  it("我帮助的按助力时间倒序映射帖子和确认结果", async () => {
    const attempts = createQuery([
      {
        id: "attempt-1",
        post_id: "post-1",
        status: "COMPLETED",
        helped_at: "2026-08-06T00:00:00.000Z",
        confirmation_deadline: "2026-08-07T00:00:00.000Z",
        confirmation_method: "AUTO",
        resolved_at: "2026-08-07T00:05:00.000Z",
        posts: {
          discount: 90,
          piece_number: 5,
          payloads: { command: "助力口令" },
        },
      },
    ]);
    useQueries({ request_help_attempts: attempts });

    await expect(getMyHelpedPosts()).resolves.toEqual([
      {
        attemptId: "attempt-1",
        postId: "post-1",
        discount: 90,
        pieceNumber: 5,
        payloads: { command: "助力口令" },
        status: "COMPLETED",
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod: "AUTO",
        helpedAt: "2026-08-06T00:00:00.000Z",
        resolvedAt: "2026-08-07T00:05:00.000Z",
      },
    ]);
    expect(attempts.eq).toHaveBeenCalledWith("helper_id", "user-1");
    expect(attempts.order).toHaveBeenCalledWith("helped_at", { ascending: false });
  });
});
