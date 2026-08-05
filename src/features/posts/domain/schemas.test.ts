import { describe, expect, it } from "vitest";

import { createPostInputSchema } from "./schemas";

const baseInput = {
  type: "GIVE" as const,
  sources: { command: "￥19uSvG￥" },
};

describe("createPostInputSchema", () => {
  it.each([undefined, "OTHER"])('rejects invalid post type %s', (type) => {
    const result = createPostInputSchema.safeParse({
      ...baseInput,
      type,
      selection: { discount: 80, pieceNumber: 9 },
    });

    expect(result.success).toBe(false);
  });

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

  it("rejects input without a usable source", () => {
    const result = createPostInputSchema.safeParse({
      ...baseInput,
      selection: { discount: 80, pieceNumber: 9 },
      sources: {},
    });

    expect(result.success).toBe(false);
  });

  it.each([
    { command: "￥19uSvG￥" },
    { url: "https://h.app.coc.10086.cn/example" },
    {
      command: "￥19uSvG￥",
      url: "https://h.app.coc.10086.cn/example",
    },
  ])("accepts one or two sources", (sources) => {
    const result = createPostInputSchema.safeParse({
      ...baseInput,
      selection: { discount: 80, pieceNumber: 9 },
      sources,
    });

    expect(result.success).toBe(true);
  });

  it("trims valid source values", () => {
    const result = createPostInputSchema.parse({
      ...baseInput,
      selection: { discount: 80, pieceNumber: 9 },
      sources: {
        command: "  ￥19uSvG￥  ",
        url: "  https://h.app.coc.10086.cn/example  ",
      },
    });

    expect(result.sources).toEqual({
      command: "￥19uSvG￥",
      url: "https://h.app.coc.10086.cn/example",
    });
  });
});
