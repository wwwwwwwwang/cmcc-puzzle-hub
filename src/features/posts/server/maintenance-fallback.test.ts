import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getRedis, syncRequestMaintenance } = vi.hoisted(() => ({
  getRedis: vi.fn(),
  syncRequestMaintenance: vi.fn(),
}));

vi.mock("./redis", () => ({ getRedis }));
vi.mock("./post-repository", () => ({ syncRequestMaintenance }));

import { runMaintenanceFallback } from "./maintenance-fallback";

describe("账户活动维护兜底", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("取得全局锁后执行一次维护", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getRedis.mockReturnValue({ set });
    syncRequestMaintenance.mockResolvedValue({});

    await runMaintenanceFallback();

    expect(set).toHaveBeenCalledWith(
      "maintenance:request-help:read-fallback",
      "1",
      { nx: true, ex: 300 },
    );
    expect(syncRequestMaintenance).toHaveBeenCalledTimes(1);
  });

  it("未取得锁或 Redis 失败时不执行维护且不抛错", async () => {
    getRedis.mockReturnValue({ set: vi.fn().mockResolvedValue(null) });
    await expect(runMaintenanceFallback()).resolves.toBeUndefined();
    expect(syncRequestMaintenance).not.toHaveBeenCalled();

    getRedis.mockReturnValue({
      set: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    });
    await expect(runMaintenanceFallback()).resolves.toBeUndefined();
  });
});
