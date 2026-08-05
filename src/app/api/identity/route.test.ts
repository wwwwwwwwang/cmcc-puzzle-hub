import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashVisitorId } = vi.hoisted(() => ({
  hashVisitorId: vi.fn(() => "0123456789abcdef".repeat(4)),
}));

vi.mock("@/features/posts/device/hash", () => ({ hashVisitorId }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashVisitorId.mockReturnValue("0123456789abcdef".repeat(4));
  });

  it("返回公开 ID 且禁止缓存", async () => {
    const response = await POST(request({ visitorId: "visitor-id-123" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      publicId: "U-0123456789ABCDEF",
    });
  });

  it("非法输入返回 400", async () => {
    const response = await POST(request({ visitorId: "short" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_INPUT" },
    });
    expect(hashVisitorId).not.toHaveBeenCalled();
  });

  it("服务异常返回 503 且日志不泄露 visitorId", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    hashVisitorId.mockImplementation(() => {
      throw new Error("visitor-id-123 secret");
    });

    const response = await POST(request({ visitorId: "visitor-id-123" }));

    expect(response.status).toBe(503);
    const log = JSON.stringify(error.mock.calls[0]);
    expect(log).toMatch(/SERVICE_UNAVAILABLE/);
    expect(log).toMatch(/requestId/);
    expect(log).not.toContain("visitor-id-123");
    expect(log).not.toContain("secret");
    error.mockRestore();
  });
});
