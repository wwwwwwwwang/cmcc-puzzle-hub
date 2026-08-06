import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getAccountActivity } = vi.hoisted(() => ({
  getAccountActivity: vi.fn(),
}));

vi.mock("@/features/posts/server/user-queries", () => ({ getAccountActivity }));

import { GET } from "./route";

describe("GET /api/me/activity", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
