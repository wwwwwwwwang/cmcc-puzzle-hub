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
  selection: { discount: 80, pieceNumber: 6 },
  source: { kind: "COMMAND" as const, value: GIVE_COMMAND },
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
        payloadKind: "COMMAND",
        payload: "￥19uSvG￥",
        publisherDeviceHash: "device-hash",
        payloadHash: "payload-hash",
        createdAt: "2027-01-15T08:00:00.000Z",
        expiresAt: "2027-01-16T08:00:00.000Z",
      },
    });
  });

  it.each([
    {
      name: "赠送口令",
      selection: { discount: 80, pieceNumber: 6 },
      source: { kind: "COMMAND" as const, value: GIVE_COMMAND },
      type: "GIVE",
      payloadKind: "COMMAND",
      payload: "￥19uSvG￥",
    },
    {
      name: "求助口令",
      selection: { discount: 80, pieceNumber: 1 },
      source: { kind: "COMMAND" as const, value: REQUEST_COMMAND },
      type: "REQUEST",
      payloadKind: "COMMAND",
      payload: "￥19uSvR￥",
    },
    {
      name: "赠送 URL",
      selection: { discount: 80, pieceNumber: 6 },
      source: { kind: "URL" as const, value: GIVE_URL },
      type: "GIVE",
      payloadKind: "URL",
      payload: GIVE_URL,
    },
    {
      name: "求助 URL",
      selection: { discount: 80, pieceNumber: 1 },
      source: { kind: "URL" as const, value: REQUEST_URL },
      type: "REQUEST",
      payloadKind: "URL",
      payload: REQUEST_URL,
    },
  ])("发布真实样本 $name", async ({ selection, source, type, payloadKind, payload }) => {
    const response = await POST(request({ ...baseInput, selection, source }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toHaveProperty("post");
    const published = publishPost.mock.calls[0][0];
    expect(published).toMatchObject({ type, payloadKind, payload });
    expect(published.payloadHash).toMatch(/^[0-9a-f]{64}$/);
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

  it("恶意 URL 返回 400/INVALID_CONTENT", async () => {
    const response = await POST(
      request({
        ...baseInput,
        source: {
          kind: "URL",
          value: GIVE_URL.replace("h.app.coc.10086.cn", "evil.example.com"),
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
          payloadKind: "COMMAND",
          createdAt: "2027-01-15T08:00:00.000Z",
          expiresAt: "2027-01-16T08:00:00.000Z",
        },
      ],
      nextCursor: "cursor-value",
    });
    const response = await GET(
      new Request("http://localhost/api/posts?type=GIVE&discount=80&limit=20"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: expect.any(Array),
      nextCursor: "cursor-value",
    });
    expect(listPosts).toHaveBeenCalledWith(
      { type: "GIVE", discount: 80, limit: 20 },
    );
  });

  it.each([
    "type=OTHER",
    "discount=70",
    "limit=21",
    "limit=0",
    "cursor=not+base64url",
    "unknown=value",
  ])("GET 非法参数 %s 返回 400", async (query) => {
    const response = await GET(new Request(`http://localhost/api/posts?${query}`));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_INPUT" },
    });
  });
});
