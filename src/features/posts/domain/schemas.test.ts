import { describe, expect, it } from "vitest";

import { createPostInputSchema } from "./schemas";

const baseInput = {
  source: {
    type: "COMMAND" as const,
    value: "￥19uSvG￥",
  },
  visitorId: "device-visitor-id",
};

describe("createPostInputSchema", () => {
  it.each([
    { discount: 95 as const, pieceNumber: 5 },
    { discount: 90 as const, pieceNumber: 7 },
    { discount: 80 as const, pieceNumber: 10 },
  ])("rejects $discount discount piece $pieceNumber", (selection) => {
    const result = createPostInputSchema.safeParse({
      ...baseInput,
      selection,
    });

    expect(result.success).toBe(false);
  });

  it("accepts 80 discount piece 9", () => {
    const result = createPostInputSchema.safeParse({
      ...baseInput,
      selection: { discount: 80, pieceNumber: 9 },
    });

    expect(result.success).toBe(true);
  });
});
