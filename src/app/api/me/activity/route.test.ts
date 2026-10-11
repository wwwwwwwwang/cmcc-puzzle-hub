import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getAccountActivity, runMaintenanceFallback } = vi.hoisted(() => ({
  getAccountActivity: vi.fn(),
  runMaintenanceFallback: vi.fn(),
}));

vi.mock("@/features/posts/server/user-queries", () => ({ getAccountActivity }));
vi.mock("@/features/posts/server/maintenance-fallback", () => ({
  runMaintenanceFallback,
}));

import { GET } from "./route";

describe("GET /api/me/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runMaintenanceFallback.mockResolvedValue(undefined);
  });

  it("未登录返回 401", async () => {
    getAccountActivity.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("返回待处理数量和版本且禁止缓存", async () => {
    getAccountActivity.mockResolvedValue({
      pendingConfirmationCount: 2,
      pendingHelpCount: 1,
      version: "2026-08-06T00:00:00.000Z",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      pendingConfirmationCount: 2,
      pendingHelpCount: 1,
      version: "2026-08-06T00:00:00.000Z",
    });
  });

  it("账户活动查询失败返回 503", async () => {
    getAccountActivity.mockRejectedValue(new Error("function missing"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(runMaintenanceFallback).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });
});
