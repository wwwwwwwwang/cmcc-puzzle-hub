import { describe, expect, it } from "vitest";

import {
  allIndexKey,
  claimKey,
  createPostId,
  dedupeKey,
  discountIndexKey,
  parsePostId,
  postKey,
  typeDiscountIndexKey,
  typeIndexKey,
} from "./keys";

describe("Redis post keys", () => {
  it("生成生产键和带测试前缀的隔离键", () => {
    expect(postKey("p_1_id")).toBe("post:p_1_id");
    expect(dedupeKey("hash", "test:run")).toBe("test:run:dedupe:hash");
    expect(claimKey("p_1_id", "test:run")).toBe("test:run:claim:p_1_id");
    expect(allIndexKey("test:run")).toBe("test:run:hall:posts");
    expect(typeIndexKey("GIVE", "test:run")).toBe("test:run:hall:type:GIVE");
    expect(discountIndexKey(90, "test:run")).toBe(
      "test:run:hall:discount:90",
    );
    expect(typeDiscountIndexKey("REQUEST", 80, "test:run")).toBe(
      "test:run:hall:type:REQUEST:discount:80",
    );
  });

  it("生成并完整校验带到期时间的发布 ID", () => {
    const id = createPostId(1_800_000_000_000, () =>
      "123e4567-e89b-42d3-a456-426614174000",
    );

    expect(id).toBe(
      "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
    );
    expect(parsePostId(id)).toEqual({ expiresAtMillis: 1_800_000_000_000 });
  });

  it.each([
    "p_1800000000000_not-a-uuid",
    "x_1800000000000_123e4567-e89b-42d3-a456-426614174000",
    "p_not-a-time_123e4567-e89b-42d3-a456-426614174000",
    "p_1800000000000_123e4567-e89b-42d3-a456-426614174000_extra",
  ])("拒绝非法发布 ID %s", (id) => {
    expect(parsePostId(id)).toBeNull();
  });
});
