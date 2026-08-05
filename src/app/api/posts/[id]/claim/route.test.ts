import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { claimPost, checkClaimRateLimit, getApprovedUser } = vi.hoisted(() => ({
  claimPost: vi.fn(),
  checkClaimRateLimit: vi.fn(),
  getApprovedUser: vi.fn(),
}));

vi.mock("@/features/posts/server/post-repository", () => ({ claimPost }));
vi.mock("@/features/posts/server/rate-limit", () => ({ checkClaimRateLimit }));
vi.mock("@/lib/supabase/server", () => ({ getApprovedUser }));

import { POST } from "./route";

const POST_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request(`http://localhost/api/posts/${POST_ID}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/posts/[id]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovedUser.mockResolvedValue({ id: USER_ID });
    checkClaimRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    claimPost.mockResolvedValue({
      status: "CLAIMED",
      payloads: { command: "￥19uSvG￥" },
      idempotent: false,
    });
  });

  it("成功领取返回载荷并设置 no-store", async () => {
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      payloads: { command: "￥19uSvG￥" },
      idempotent: false,
    });
    expect(claimPost).toHaveBeenCalledWith(POST_ID, USER_ID, true);
  });

  it("未登录返回 401", async () => {
    getApprovedUser.mockResolvedValue(null);
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(401);
    expect(claimPost).not.toHaveBeenCalled();
  });

  it("非法 UUID 返回 400 且不调用仓储", async () => {
    const response = await POST(request(), params("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(claimPost).not.toHaveBeenCalled();
  });

  it("超限返回 429", async () => {
    checkClaimRateLimit.mockResolvedValue({ success: false, reset: Date.now() + 5000 });
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(claimPost).not.toHaveBeenCalled();
  });

  it.each([
    ["SELF_CLAIM_FORBIDDEN", 403],
    ["ALREADY_CLAIMED", 409],
    ["EXPIRED", 404],
    ["INSUFFICIENT_CREDITS", 402],
  ] as const)("映射 %s", async (status, expectedStatus) => {
    claimPost.mockResolvedValue({ status });
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({ error: { code: status } });
  });

  it("服务异常返回 503,日志不含敏感信息", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    claimPost.mockRejectedValue(new Error("db down secret-token"));
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(503);
    const log = JSON.stringify(error.mock.calls[0]);
    expect(log).toMatch(/SERVICE_UNAVAILABLE/);
    expect(log).toMatch(/requestId/);
    expect(log).not.toContain("secret-token");
    error.mockRestore();
  });
});
