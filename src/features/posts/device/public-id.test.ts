import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toPublicDeviceId } from "./public-id";

describe("toPublicDeviceId", () => {
  it("从设备哈希生成固定长度公开 ID", () => {
    expect(toPublicDeviceId("0123456789abcdef".repeat(4))).toBe(
      "U-0123456789ABCDEF",
    );
  });

  it.each(["", "not-a-hash", "A".repeat(64), "0".repeat(63)])(
    "拒绝非法设备哈希 %s",
    (value) => {
      expect(() => toPublicDeviceId(value)).toThrow(/device hash/i);
    },
  );
});
