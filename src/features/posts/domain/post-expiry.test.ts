import { describe, expect, it } from "vitest";

import { getPostExpiresAt } from "./post-expiry";

describe("getPostExpiresAt", () => {
  it.each([
    ["普通月份", "2026-08-06T12:00:00.000Z", "2026-08-31T16:00:00.000Z"],
    [
      "月末最后一秒",
      "2026-08-31T15:59:59.999Z",
      "2026-08-31T16:00:00.000Z",
    ],
    ["月界零点", "2026-08-31T16:00:00.000Z", "2026-09-30T16:00:00.000Z"],
    ["跨年", "2026-12-31T15:00:00.000Z", "2026-12-31T16:00:00.000Z"],
  ])("%s 计算北京时间次月一日零点", (_name, now, expected) => {
    expect(getPostExpiresAt(new Date(now)).toISOString()).toBe(expected);
  });
});
