import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/device/hash", () => ({
  hashVisitorId: vi.fn(() => "device-hash"),
}));

const { claimPost } = vi.hoisted(() => ({ claimPost: vi.fn() }));
vi.mock("@/features/posts/server/post-repository", () => ({ claimPost }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/posts/p_1800000000000_123e4567-e89b-42d3-a456-426614174000/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/posts/[id]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimPost.mockResolvedValue({
      status: "CLAIMED",
      payloadKind: "COMMAND",
      payload: "￥19uSvG￥",
      idempotent: false,
    });
  });

  it("成功领取返回载荷并设置 no-store", async () => {
    const response = await POST(
      request({ visitorId: "visitor-id-123" }),
      { params: Promise.resolve({ id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      payloadKind: "COMMAND",
      payload: "￥19uSvG￥",
    });
  });

  it.each([
    ["SELF_CLAIM_FORBIDDEN", 403],
    ["ALREADY_CLAIMED", 409],
    ["EXPIRED", 404],
  ] as const)("映射 %s", async (status, expectedStatus) => {
    claimPost.mockResolvedValue({ status });
    const response = await POST(
      request({ visitorId: "visitor-id-123" }),
      { params: Promise.resolve({ id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000" }) },
    );
    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({ error: { code: status } });
  });

  it("非法 ID/body 返回 400 且不调用仓储", async () => {
    const response = await POST(
      request({ visitorId: "short" }),
      { params: Promise.resolve({ id: "invalid-id" }) },
    );
    expect(response.status).toBe(400);
    expect(claimPost).not.toHaveBeenCalled();
  });

  it("Redis 错误返回 503/SERVICE_UNAVAILABLE", async () => {
    claimPost.mockRejectedValue(new Error("redis unavailable"));
    const response = await POST(
      request({ visitorId: "visitor-id-123" }),
      { params: Promise.resolve({ id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000" }) },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });
});
