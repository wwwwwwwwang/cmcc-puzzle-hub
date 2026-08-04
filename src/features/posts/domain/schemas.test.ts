import { describe, expect, it } from "vitest";

import { createPostInputSchema } from "./schemas";

const baseInput = {
  source: {
    kind: "COMMAND" as const,
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

  it.each([
    { kind: "COMMAND" as const, value: "" },
    { kind: "URL" as const, value: "   " },
  ])("rejects empty $kind source values", (source) => {
    const result = createPostInputSchema.safeParse({
      ...baseInput,
      selection: { discount: 80, pieceNumber: 9 },
      source,
    });

    expect(result.success).toBe(false);
  });

  it("trims a valid source value", () => {
    const result = createPostInputSchema.parse({
      ...baseInput,
      selection: { discount: 80, pieceNumber: 9 },
      source: { kind: "COMMAND", value: "  ￥19uSvG￥  " },
    });

    expect(result.source.value).toBe("￥19uSvG￥");
  });
});
