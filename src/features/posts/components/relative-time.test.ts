import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relative-time";

const now = Date.parse("2026-08-05T04:00:00.000Z");

describe("formatRelativeTime", () => {
  it.each([
    ["2026-08-05T03:59:40.000Z", "刚刚"],
    ["2026-08-05T03:58:00.000Z", "2分钟前"],
    ["2026-08-05T01:00:00.000Z", "3小时前"],
  ])("格式化 %s", (createdAt, expected) => {
    expect(formatRelativeTime(createdAt, now)).toBe(expected);
  });

  it("超过一天显示本地月日", () => {
    expect(formatRelativeTime("2026-08-03T04:00:00.000Z", now)).toMatch(
      /8.*3/,
    );
  });
});
