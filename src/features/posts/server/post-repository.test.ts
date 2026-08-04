import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StoredPost } from "../domain/types";
import {
  claimPost,
  listPosts,
  PUBLISH_POST_SCRIPT,
  publishPost,
  type PostRedis,
} from "./post-repository";
import { CLAIM_POST_SCRIPT } from "./claim-script";

const basePost: Omit<StoredPost, "id"> = {
  type: "GIVE",
  discount: 95,
  pieceNumber: 2,
  payloadKind: "COMMAND",
  payload: "secret-command",
  publisherDeviceHash: "publisher-hash",
  payloadHash: "payload-hash",
  createdAt: "2027-01-15T08:00:00.000Z",
  expiresAt: "2027-01-16T08:00:00.000Z",
};

function createRedis(overrides: Partial<PostRedis> = {}): PostRedis {
  return {
    eval: vi.fn(async () => "CREATED"),
    zrange: vi.fn(async () => []),
    mget: vi.fn(async () => []),
    zrem: vi.fn(async () => 0),
    zremrangebyscore: vi.fn(async () => 0),
    ...overrides,
  };
}

describe("publishPost", () => {
  it("通过单个 Lua 调用写入详情、去重键和四个索引", async () => {
    const redis = createRedis();

    const result = await publishPost(basePost, {
      redis,
      prefix: "test:run",
      randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
    });

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") throw new Error("expected created post");
    expect(result.post.id).toBe(
      "p_1800086400000_123e4567-e89b-42d3-a456-426614174000",
    );
    expect(redis.eval).toHaveBeenCalledOnce();

    const [script, keys, args] = vi.mocked(redis.eval).mock.calls[0];
    expect(script).toBe(PUBLISH_POST_SCRIPT);
    expect(keys).toEqual([
      `test:run:post:${result.post.id}`,
      "test:run:dedupe:payload-hash",
      "test:run:hall:posts",
      "test:run:hall:type:GIVE",
      "test:run:hall:discount:95",
      "test:run:hall:type:GIVE:discount:95",
    ]);
    expect(args[1]).toBe("86400");
    expect(args[2]).toBe(String(Date.parse(basePost.createdAt)));
    expect(JSON.parse(args[0])).toMatchObject({
      id: result.post.id,
      payload: "secret-command",
      publisherDeviceHash: "publisher-hash",
      payloadHash: "payload-hash",
    });
  });

  it("将 Lua 重复结果映射为稳定错误码", async () => {
    const redis = createRedis({ eval: vi.fn(async () => "DUPLICATE") });

    await expect(publishPost(basePost, { redis })).resolves.toEqual({
      status: "DUPLICATE_POST",
    });
  });
});

describe("listPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("选择组合筛选索引并显式映射安全 DTO", async () => {
    const stored: StoredPost = {
      ...basePost,
      id: "p_1800086400000_123e4567-e89b-42d3-a456-426614174000",
    };
    const redis = createRedis({
      zrange: vi.fn(async () => [stored.id, Date.parse(stored.createdAt)]),
      mget: vi.fn(async () => [stored]),
    });

    const page = await listPosts(
      { type: "GIVE", discount: 95 },
      { redis, prefix: "test:run" },
    );

    expect(redis.zrange).toHaveBeenCalledWith(
      "test:run:hall:type:GIVE:discount:95",
      "+inf",
      "-inf",
      expect.objectContaining({ byScore: true, rev: true, withScores: true }),
    );
    expect(page.items).toEqual([
      {
        id: stored.id,
        type: "GIVE",
        discount: 95,
        pieceNumber: 2,
        payloadKind: "COMMAND",
        createdAt: stored.createdAt,
        expiresAt: stored.expiresAt,
      },
    ]);
    expect(page.items[0]).not.toHaveProperty("payload");
    expect(page.items[0]).not.toHaveProperty("publisherDeviceHash");
    expect(page.items[0]).not.toHaveProperty("payloadHash");
  });

  it("丢弃空详情并从所有可能索引惰性清理孤立 ID", async () => {
    const orphanId =
      "p_1800086400000_123e4567-e89b-42d3-a456-426614174000";
    const redis = createRedis({
      zrange: vi.fn(async () => [orphanId, 100]),
      mget: vi.fn(async () => [null]),
    });

    await expect(listPosts({}, { redis, prefix: "test:run" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });

    const cleanedKeys = vi.mocked(redis.zrem).mock.calls.map(([key]) => key);
    expect(cleanedKeys).toContain("test:run:hall:posts");
    expect(cleanedKeys).toContain("test:run:hall:type:GIVE");
    expect(cleanedKeys).toContain("test:run:hall:type:REQUEST:discount:80");
    expect(vi.mocked(redis.zrem).mock.calls.every(([, id]) => id === orphanId)).toBe(
      true,
    );
  });

  it("使用包含 score 和 id 的游标稳定翻页且不重复同分记录", async () => {
    const posts = ["c", "b", "a"].map((suffix) => ({
      ...basePost,
      id: `p_1800086400000_123e4567-e89b-42d3-a456-42661417400${suffix}`,
    }));
    const redis = createRedis({
      zrange: vi.fn(async () => posts.flatMap((post) => [post.id, 100])),
      mget: vi.fn(async (...keys: string[]) =>
        keys.map((key) => posts.find((post) => key.endsWith(post.id)) ?? null),
      ),
    });

    const first = await listPosts({ limit: 2 }, { redis });
    const second = await listPosts(
      { limit: 2, cursor: first.nextCursor ?? undefined },
      { redis },
    );

    expect(first.items.map(({ id }) => id)).toEqual([posts[0].id, posts[1].id]);
    expect(first.nextCursor).toBeTruthy();
    expect(second.items.map(({ id }) => id)).toEqual([posts[2].id]);
  });

  it("跨 40 条扫描时清理孤立项不会跳过后续有效记录", async () => {
    const ids = Array.from({ length: 41 }, (_, index) =>
      `p_1800086400000_123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
    );
    let activeIds = [...ids];
    const storedById = new Map([
      [
        ids[40],
        {
          ...basePost,
          id: ids[40],
        } satisfies StoredPost,
      ],
    ]);
    const redis = createRedis({
      zrange: vi.fn(async (_key, _max, _min, options) =>
        activeIds
          .slice(options.offset, options.offset + options.count)
          .flatMap((id, index) => [id, 100 - options.offset - index]),
      ),
      mget: vi.fn(async (...keys: string[]) =>
        keys.map((key) => {
          const id = key.slice("post:".length);
          return storedById.get(id) ?? null;
        }),
      ),
      zrem: vi.fn(async (_key, ...members: string[]) => {
        activeIds = activeIds.filter((id) => !members.includes(id));
        return members.length;
      }),
    });

    const page = await listPosts({ limit: 20 }, { redis });

    expect(page.items.map(({ id }) => id)).toEqual([ids[40]]);
    expect(redis.zrem).toHaveBeenCalledTimes(12);
    expect(
      vi.mocked(redis.zrem).mock.calls.every(([, ...members]) =>
        members.length === 40 && members[0] === ids[0] && members[39] === ids[39],
      ),
    ).toBe(true);
  });

  it("先裁剪过期索引并将孤立清理限制为每批 40 个", async () => {
    const ids = Array.from({ length: 81 }, (_, index) =>
      `p_1800086400000_123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
    );
    const redis = createRedis({
      zrange: vi.fn(async (_key, _max, _min, options) =>
        ids
          .slice(options.offset, options.offset + options.count)
          .flatMap((id) => [id, 100]),
      ),
      mget: vi.fn(async (...keys: string[]) => keys.map(() => null)),
    });

    await listPosts({}, { redis });

    expect(redis.zremrangebyscore).toHaveBeenCalledWith(
      "hall:posts",
      "-inf",
      expect.any(Number),
    );
    expect(
      vi.mocked(redis.zrem).mock.calls.every(([, ...members]) => members.length <= 40),
    ).toBe(true);
  });
});

describe("claimPost", () => {
  const postId =
    "p_1800086400000_123e4567-e89b-42d3-a456-426614174000";

  it("严格拒绝非法 ID 且不调用 Redis", async () => {
    const redis = createRedis();

    await expect(
      claimPost("invalid-post-id", "claimant-hash", { redis }),
    ).resolves.toEqual({ status: "INVALID_POST_ID" });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("向 Lua 传递领取键、详情键、全部候选索引和服务端时间", async () => {
    const redis = createRedis({
      eval: vi.fn(async () =>
        JSON.stringify({
          status: "CLAIMED",
          payloadKind: "COMMAND",
          payload: "secret-command",
          idempotent: false,
        }),
      ),
    });

    await expect(
      claimPost(postId, "claimant-hash", {
        redis,
        prefix: "test:run",
        now: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({
      status: "CLAIMED",
      payloadKind: "COMMAND",
      payload: "secret-command",
      idempotent: false,
    });

    const [script, keys, args] = vi.mocked(redis.eval).mock.calls[0];
    expect(script).toBe(CLAIM_POST_SCRIPT);
    expect(keys).toHaveLength(14);
    expect(keys.slice(0, 3)).toEqual([
      `test:run:claim:${postId}`,
      `test:run:post:${postId}`,
      "test:run:hall:posts",
    ]);
    expect(keys).toContain("test:run:hall:type:GIVE:discount:95");
    expect(keys).toContain("test:run:hall:type:REQUEST:discount:80");
    expect(args).toEqual([
      "claimant-hash",
      "300",
      postId,
      "1700000000000",
      "1800086400000",
    ]);
  });

  it.each([
    ["SELF_CLAIM_FORBIDDEN", { status: "SELF_CLAIM_FORBIDDEN" }],
    ["ALREADY_CLAIMED", { status: "ALREADY_CLAIMED" }],
    ["EXPIRED", { status: "EXPIRED" }],
  ] as const)("解析稳定状态 %s", async (status, expected) => {
    const redis = createRedis({
      eval: vi.fn(async () => JSON.stringify({ status })),
    });

    await expect(claimPost(postId, "claimant-hash", { redis })).resolves.toEqual(
      expected,
    );
  });

  it("解析同设备幂等领取载荷", async () => {
    const redis = createRedis({
      eval: vi.fn(async () =>
        JSON.stringify({
          status: "CLAIMED",
          payloadKind: "URL",
          payload: "https://example.com/secret",
          idempotent: true,
        }),
      ),
    });

    await expect(claimPost(postId, "claimant-hash", { redis })).resolves.toEqual({
      status: "CLAIMED",
      payloadKind: "URL",
      payload: "https://example.com/secret",
      idempotent: true,
    });
  });

  it("拒绝未知或畸形 Lua 结果", async () => {
    const redis = createRedis({
      eval: vi.fn(async () => JSON.stringify({ status: "UNKNOWN" })),
    });

    await expect(claimPost(postId, "claimant-hash", { redis })).rejects.toThrow(
      /claim script result/i,
    );
  });
});
