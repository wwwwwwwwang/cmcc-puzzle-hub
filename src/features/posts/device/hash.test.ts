import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashVisitorId } from "./hash";

describe("hashVisitorId", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("使用 secret 生成稳定的 64 位十六进制 HMAC", () => {
    const first = hashVisitorId("  visitor-one  ", "test-secret");
    const second = hashVisitorId("visitor-one", "test-secret");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("visitor-one");
  });

  it("不同 visitorId 生成不同摘要", () => {
    expect(hashVisitorId("visitor-one", "test-secret")).not.toBe(
      hashVisitorId("visitor-two", "test-secret"),
    );
  });

  it("secret 缺失或空白时抛出不泄露 visitorId 的配置错误", () => {
    vi.stubEnv("DEVICE_HASH_SECRET", "");

    expect(() => hashVisitorId("secret-visitor")).toThrow(/DEVICE_HASH_SECRET/);
    expect(() => hashVisitorId("secret-visitor")).not.toThrow("secret-visitor");
    expect(() => hashVisitorId("secret-visitor", "   ")).toThrow(/DEVICE_HASH_SECRET/);
    expect(() => hashVisitorId("secret-visitor", "   ")).not.toThrow("secret-visitor");
  });

  it("visitorId trim 后为空时拒绝", () => {
    expect(() => hashVisitorId("   ", "test-secret")).toThrow(/visitorId/i);
  });
});
