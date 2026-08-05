import {
  GIVE_COMMAND,
  GIVE_URL,
  REQUEST_COMMAND,
  REQUEST_URL,
} from "../../../../tests/fixtures/cmcc-samples";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/device/hash", () => ({
  hashVisitorId: vi.fn(() => "device-hash"),
}));

const { publishPost, listPosts, checkPublishRateLimit } = vi.hoisted(() => ({
  publishPost: vi.fn(),
  listPosts: vi.fn(),
  checkPublishRateLimit: vi.fn(),
}));

vi.mock("@/features/posts/server/post-repository", () => ({
  publishPost,
  listPosts,
}));
vi.mock("@/features/posts/server/rate-limit", () => ({
  checkPublishRateLimit,
}));

import { GET, POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseInput = {
  type: "GIVE" as const,
  selection: { discount: 80, pieceNumber: 6 },
  sources: { command: GIVE_COMMAND },
  visitorId: "visitor-id-123",
};

describe("/api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkPublishRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    publishPost.mockResolvedValue({
      status: "CREATED",
      post: {
        id: "p_1800086400000_123e4567-e89b-42d3-a456-426614174000",
        type: "GIVE",
        discount: 80,
        pieceNumber: 6,
        availablePayloadKinds: ["COMMAND"],
        payloads: { command: "￥19uSvG￥" },
        publisherDeviceHash: "device-hash",
        payloadHashes: { command: "payload-hash" },
        createdAt: "2027-01-15T08:00:00.000Z",
        expiresAt: "2027-01-16T08:00:00.000Z",
      },
    });
  });

  it("异常日志仅记录错误码与 requestId", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    publishPost.mockRejectedValue(new Error(`redis ${GIVE_URL} visitor-id-123 token-secret`));

    await POST(request(baseInput));

    expect(error).toHaveBeenCalledOnce();
    const log = JSON.stringify(error.mock.calls[0]);
    expect(log).toMatch(/SERVICE_UNAVAILABLE/);
    expect(log).toMatch(/requestId/);
    expect(log).not.toContain("visitor-id-123");
    expect(log).not.toContain(GIVE_URL);
    expect(log).not.toContain("token-secret");
    error.mockRestore();
  });

  it.each([
    {
      name: "赠送口令",
      selection: { discount: 80, pieceNumber: 6 },
      sources: { command: GIVE_COMMAND },
      type: "GIVE",
      payloads: { command: "￥19uSvG￥" },
    },
    {
      name: "求助口令",
      selection: { discount: 80, pieceNumber: 1 },
      sources: { command: REQUEST_COMMAND },
      type: "REQUEST",
      payloads: { command: "￥19uSvR￥" },
    },
    {
      name: "赠送 URL",
      selection: { discount: 80, pieceNumber: 6 },
      sources: { url: GIVE_URL },
      type: "GIVE",
      payloads: { url: GIVE_URL },
    },
    {
      name: "求助 URL",
      selection: { discount: 80, pieceNumber: 1 },
      sources: { url: REQUEST_URL },
      type: "REQUEST",
      payloads: { url: REQUEST_URL },
    },
  ])("发布真实样本 $name", async ({ selection, sources, type, payloads }) => {
    const response = await POST(
      request({ ...baseInput, type, selection, sources }),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toHaveProperty("post");
    const published = publishPost.mock.calls[0][0];
    expect(published).toMatchObject({ type, payloads });
    expect(Object.values(published.payloadHashes)[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(published.publisherDeviceHash).toBe("device-hash");
  });

  it("口令拼图与选择不一致返回 400/SELECTION_MISMATCH", async () => {
    const response = await POST(
      request({
        ...baseInput,
        selection: { discount: 80, pieceNumber: 1 },
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SELECTION_MISMATCH" },
    });
  });

  it("请求类型与内容类型不一致返回 400/TYPE_MISMATCH", async () => {
    const response = await POST(
      request({ ...baseInput, type: "REQUEST" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "TYPE_MISMATCH" },
    });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("恶意 URL 返回 400/INVALID_CONTENT", async () => {
    const response = await POST(
      request({
        ...baseInput,
        sources: {
          url: GIVE_URL.replace("h.app.coc.10086.cn", "evil.example.com"),
        },
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_CONTENT" },
    });
  });

  it("重复发布返回 409/DUPLICATE_POST", async () => {
    publishPost.mockResolvedValue({ status: "DUPLICATE_POST" });
    const response = await POST(request(baseInput));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE_POST" },
    });
  });

  it("超限返回 429/RATE_LIMITED", async () => {
    checkPublishRateLimit.mockResolvedValue({ success: false, reset: 1234 });
    const response = await POST(request(baseInput));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });

  it("无效 JSON/输入返回 400/INVALID_INPUT", async () => {
    const response = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{broken",
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_INPUT" },
    });
  });

  it("Redis 错误返回 503/SERVICE_UNAVAILABLE", async () => {
    publishPost.mockRejectedValue(new Error("redis unavailable"));
    const response = await POST(request(baseInput));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });

  it("GET 严格校验参数并只返回安全列表 DTO", async () => {
    listPosts.mockResolvedValue({
      items: [
        {
          id: "p_1800086400000_123e4567-e89b-42d3-a456-426614174000",
          type: "GIVE",
          discount: 80,
          pieceNumber: 9,
          availablePayloadKinds: ["COMMAND"],
          createdAt: "2027-01-15T08:00:00.000Z",
          expiresAt: "2027-01-16T08:00:00.000Z",
        },
      ],
      nextCursor: "cursor-value",
    });
    const response = await GET(
      new Request(
        "http://localhost/api/posts?type=GIVE&discount=80&pieceNumber=6&limit=20",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: expect.any(Array),
      nextCursor: "cursor-value",
    });
    expect(listPosts).toHaveBeenCalledWith({
      type: "GIVE",
      discount: 80,
      pieceNumber: 6,
      limit: 20,
    });
  });

  it.each([
    "type=OTHER",
    "discount=70",
    "pieceNumber=0",
    "pieceNumber=1.5",
    "pieceNumber=05",
    "discount=95&pieceNumber=5",
    "pieceNumber=1&pieceNumber=2",
    "limit=21",
    "limit=0",
    "cursor=abc",
    `cursor=${Buffer.from(JSON.stringify({ score: "bad", id: "" })).toString("base64url")}`,
    "unknown=value",
  ])("GET 非法参数 %s 返回 400", async (query) => {
    const response = await GET(new Request(`http://localhost/api/posts?${query}`));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_INPUT" },
    });
    expect(listPosts).not.toHaveBeenCalled();
  });

  it("GET 仓储异常日志不泄露 cursor", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cursor = Buffer.from(
      JSON.stringify({
        score: 100,
        id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
      }),
    ).toString("base64url");
    listPosts.mockRejectedValue(new Error(`redis cursor=${cursor} token-secret`));

    const response = await GET(
      new Request(`http://localhost/api/posts?cursor=${cursor}`),
    );

    expect(response.status).toBe(503);
    const log = JSON.stringify(error.mock.calls[0]);
    expect(log).toMatch(/SERVICE_UNAVAILABLE/);
    expect(log).not.toContain(cursor);
    expect(log).not.toContain("token-secret");
    error.mockRestore();
  });
});
