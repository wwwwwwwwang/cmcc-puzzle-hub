import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEVICE_STORAGE_KEY, getPersistentVisitorId } from "./client";

describe("getPersistentVisitorId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("复用非空缓存且不调用 loader", async () => {
    localStorage.setItem(DEVICE_STORAGE_KEY, "cached-device-id");
    const loader = vi.fn(async () => "loaded-device-id");

    await expect(getPersistentVisitorId(loader)).resolves.toBe("cached-device-id");
    expect(loader).not.toHaveBeenCalled();
  });

  it("首次调用 loader 后缓存并返回 visitorId", async () => {
    const loader = vi.fn(async () => "fingerprint-device-id");

    await expect(getPersistentVisitorId(loader)).resolves.toBe("fingerprint-device-id");
    expect(localStorage.getItem(DEVICE_STORAGE_KEY)).toBe("fingerprint-device-id");
  });

  it("拒绝空 loader 结果", async () => {
    await expect(getPersistentVisitorId(async () => "   ")).rejects.toThrow(
      /visitorId/i,
    );
  });

  it("向上抛出 loader 失败", async () => {
    const error = new Error("fingerprint failed");

    await expect(getPersistentVisitorId(async () => Promise.reject(error))).rejects.toBe(
      error,
    );
  });

  it("localStorage 写入失败时拒绝返回未持久化身份", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    await expect(getPersistentVisitorId(async () => "device-id")).rejects.toThrow(
      "storage unavailable",
    );
  });
});
