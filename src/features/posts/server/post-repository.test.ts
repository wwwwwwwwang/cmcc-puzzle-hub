import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import {
  claimPost,
  delistPost,
  listPosts,
  publishPost,
  type PublishPostArgs,
} from "./post-repository";

type RpcMock = ReturnType<typeof vi.fn>;

function createClient(rpcImpl?: (fn: string, args: unknown) => unknown) {
  const rpc: RpcMock = vi.fn(async (fn: string, args: unknown) => ({
    data: rpcImpl ? rpcImpl(fn, args) : null,
    error: null,
  }));
  return { client: { rpc } as never, rpc };
}

const baseArgs: PublishPostArgs = {
  publisherId: "11111111-1111-4111-8111-111111111111",
  type: "GIVE",
  discount: 95,
  pieceNumber: 2,
  payloads: { command: "secret", url: "https://h.app.coc.10086.cn/x" },
  availablePayloadKinds: ["COMMAND", "URL"],
  payloadHashes: ["hash-a", "hash-b"],
  expiresAt: "2027-01-16T08:00:00.000Z",
};

describe("publishPost", () => {
  it("调用 publish_post RPC 并映射 CREATED 结果", async () => {
    const { client, rpc } = createClient(() => ({
      status: "CREATED",
      post: {
        id: "p1",
        publisherId: "U-ABC",
        type: "GIVE",
        discount: 95,
        pieceNumber: 2,
        availablePayloadKinds: ["COMMAND", "URL"],
        createdAt: "2027-01-15T08:00:00.000Z",
        expiresAt: "2027-01-16T08:00:00.000Z",
      },
    }));

    const result = await publishPost(baseArgs, { client });

    expect(rpc).toHaveBeenCalledWith("publish_post", {
      p_publisher: baseArgs.publisherId,
      p_type: "GIVE",
      p_discount: 95,
      p_piece_number: 2,
      p_payloads: baseArgs.payloads,
      p_kinds: baseArgs.availablePayloadKinds,
      p_hashes: baseArgs.payloadHashes,
      p_expires_at: baseArgs.expiresAt,
    });
    expect(result).toEqual({
      status: "CREATED",
      post: expect.objectContaining({ id: "p1", publisherId: "U-ABC" }),
    });
  });

  it("映射 DUPLICATE_POST", async () => {
    const { client } = createClient(() => ({ status: "DUPLICATE_POST" }));
    const result = await publishPost(baseArgs, { client });
    expect(result).toEqual({ status: "DUPLICATE_POST" });
  });

  it("RPC error 抛出", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    await expect(
      publishPost(baseArgs, { client: { rpc } as never }),
    ).rejects.toThrow(/publish_post/);
  });
});

describe("claimPost", () => {
  it("映射 CLAIMED 与 payloads/idempotent", async () => {
    const { client } = createClient(() => ({
      status: "CLAIMED",
      idempotent: false,
      payloads: { command: "c" },
    }));
    const result = await claimPost("p1", "u1", true, { client });
    expect(result).toEqual({
      status: "CLAIMED",
      payloads: { command: "c" },
      idempotent: false,
    });
  });

  it.each([
    "SELF_CLAIM_FORBIDDEN",
    "ALREADY_CLAIMED",
    "EXPIRED",
    "INSUFFICIENT_CREDITS",
  ] as const)("透传失败状态 %s", async (status) => {
    const { client } = createClient(() => ({ status }));
    const result = await claimPost("p1", "u1", true, { client });
    expect(result.status).toBe(status);
  });
});

describe("delistPost", () => {
  it("透传下架结果", async () => {
    const { client, rpc } = createClient(() => ({ status: "DELISTED" }));
    const result = await delistPost("p1", "u1", { client });
    expect(rpc).toHaveBeenCalledWith("delist_post", {
      p_post_id: "p1",
      p_owner: "u1",
    });
    expect(result).toEqual({ status: "DELISTED" });
  });
});

describe("listPosts", () => {
  beforeEach(() => vi.clearAllMocks());

  function row(id: string, createdAt: string) {
    return {
      id,
      publisher_public_id: "U-XYZ",
      type: "GIVE",
      discount: 80,
      piece_number: 3,
      available_payload_kinds: ["COMMAND"],
      created_at: createdAt,
      expires_at: "2027-01-16T08:00:00.000Z",
    };
  }

  it("无下一页时 nextCursor 为 null", async () => {
    const { client } = createClient(() => [row("a", "2027-01-15T08:00:00Z")]);
    const page = await listPosts({ limit: 20 }, { client });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]!.publisherId).toBe("U-XYZ");
  });

  it("多取一条时生成 nextCursor 并只返回 pageSize 条", async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      row(`id${i}`, `2027-01-1${i}T08:00:00Z`),
    );
    const { client } = createClient(() => rows);
    const page = await listPosts({ limit: 2 }, { client });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
  });
});
