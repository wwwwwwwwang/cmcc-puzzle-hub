import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { helpRequestPost, checkClaimRateLimit, getApprovedUser } = vi.hoisted(
  () => ({
    helpRequestPost: vi.fn(),
    checkClaimRateLimit: vi.fn(),
    getApprovedUser: vi.fn(),
  }),
);

vi.mock("@/features/posts/server/post-repository", () => ({ helpRequestPost }));
vi.mock("@/features/posts/server/rate-limit", () => ({ checkClaimRateLimit }));
vi.mock("@/lib/supabase/server", () => ({ getApprovedUser }));

import { POST } from "./route";

const POST_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request(`http://localhost/api/posts/${POST_ID}/help`, {
    method: "POST",
    headers: { "x-forwarded-for": "1.2.3.4" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/posts/[id]/help", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovedUser.mockResolvedValue({ id: USER_ID });
    checkClaimRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    helpRequestPost.mockResolvedValue({
      status: "HELPED",
      payloads: { command: "￥help￥" },
      idempotent: false,
      confirmationDeadline: "2026-08-07T00:00:00.000Z",
    });
  });

  it("成功助力返回载荷和确认截止时间", async () => {
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      payloads: { command: "￥help￥" },
      idempotent: false,
      confirmationDeadline: "2026-08-07T00:00:00.000Z",
    });
    expect(helpRequestPost).toHaveBeenCalledWith(POST_ID, USER_ID);
  });

  it("未登录返回 401", async () => {
    getApprovedUser.mockResolvedValue(null);
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(401);
    expect(helpRequestPost).not.toHaveBeenCalled();
  });

  it("非法 UUID 返回 400", async () => {
    const response = await POST(request(), params("bad"));
    expect(response.status).toBe(400);
    expect(helpRequestPost).not.toHaveBeenCalled();
  });

  it("超限返回 429", async () => {
    checkClaimRateLimit.mockResolvedValue({ success: false, reset: Date.now() + 5000 });
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(429);
    expect(helpRequestPost).not.toHaveBeenCalled();
  });

  it.each([
    ["SELF_HELP_FORBIDDEN", 403],
    ["ALREADY_HELPED", 409],
    ["HELP_RETRY_FORBIDDEN", 409],
    ["EXPIRED", 404],
    ["INVALID_POST_TYPE", 400],
  ] as const)("映射 %s", async (status, expectedStatus) => {
    helpRequestPost.mockResolvedValue({ status });
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({ error: { code: status } });
  });

  it("服务异常返回 503", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    helpRequestPost.mockRejectedValue(new Error("secret"));
    const response = await POST(request(), params(POST_ID));
    expect(response.status).toBe(503);
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
    error.mockRestore();
  });
});
