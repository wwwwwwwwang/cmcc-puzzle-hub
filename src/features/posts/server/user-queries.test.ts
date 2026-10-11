import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import {
  getAccountActivity,
  getMyClaimedPosts,
  getMyHelpedPosts,
  getMyPosts,
} from "./user-queries";

function createQuery(data: unknown[], count: number | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.then.mockImplementation((resolve) =>
    Promise.resolve({ data, error: null, count }).then(resolve),
  );
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
        available_payload_kinds: ["URL"],
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

    await expect(getMyPosts()).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "post-1",
          status: "PENDING_CONFIRM",
          requestCreditStatus: "HELD",
          closureReason: null,
          confirmationDeadline: "2026-08-07T00:00:00.000Z",
          confirmationMethod: null,
        }),
      ],
      nextCursor: null,
    });
  });

  it("我领取的只查询赠送帖", async () => {
    const posts = createQuery([]);
    useQueries({ posts });

    await getMyClaimedPosts();

    expect(posts.eq).toHaveBeenCalledWith("claimant_id", "user-1");
    expect(posts.eq).toHaveBeenCalledWith("type", "GIVE");
    expect(posts.select).toHaveBeenCalledWith(
      expect.stringContaining("claimed_at"),
    );
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
          payloads: { url: "https://h.app.coc.10086.cn/helped" },
        },
      },
    ]);
    useQueries({ request_help_attempts: attempts });

    await expect(getMyHelpedPosts()).resolves.toEqual({
      items: [
        {
          attemptId: "attempt-1",
          postId: "post-1",
          discount: 90,
          pieceNumber: 5,
          payloads: { url: "https://h.app.coc.10086.cn/helped" },
          status: "COMPLETED",
          confirmationDeadline: "2026-08-07T00:00:00.000Z",
          confirmationMethod: "AUTO",
          helpedAt: "2026-08-06T00:00:00.000Z",
          resolvedAt: "2026-08-07T00:05:00.000Z",
        },
      ],
      nextCursor: null,
    });
    expect(attempts.eq).toHaveBeenCalledWith("helper_id", "user-1");
    expect(attempts.order).toHaveBeenCalledWith("helped_at", { ascending: false });
  });

  it("超过 20 条时返回 keyset 游标", async () => {
    const posts = createQuery(
      Array.from({ length: 21 }, (_, index) => ({
        id: `post-${String(index + 1).padStart(2, "0")}`,
        type: "GIVE",
        discount: 80,
        piece_number: 1,
        available_payload_kinds: ["URL"],
        status: "OPEN",
        request_credit_status: null,
        closure_reason: null,
        created_at: `2026-08-06T00:${String(59 - index).padStart(2, "0")}:00.000Z`,
        expires_at: "2026-08-08T00:00:00.000Z",
      })),
    );
    useQueries({ posts });

    const page = await getMyPosts();

    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toEqual(expect.any(String));

    await getMyPosts(page.nextCursor ?? undefined);

    expect(posts.or).toHaveBeenCalledWith(
      expect.stringContaining("created_at.lt."),
    );
  });

  it("账户活动通过单个 RPC 汇总两个待处理数量和最新版本", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        pendingConfirmationCount: 2,
        pendingHelpCount: 1,
        version: "2026-08-06T02:00:00.000Z",
      },
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
    });

    await expect(getAccountActivity()).resolves.toEqual({
      pendingConfirmationCount: 2,
      pendingHelpCount: 1,
      version: "2026-08-06T02:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("get_account_activity");
  });

  it("账户活动 RPC 异常时抛出可映射错误", async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "function missing" },
      }),
    });

    await expect(getAccountActivity()).rejects.toThrow("查询账户活动失败");
  });
});
