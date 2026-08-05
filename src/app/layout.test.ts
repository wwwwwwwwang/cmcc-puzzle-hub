import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import { metadata } from "./layout";

describe("site metadata", () => {
  it("使用完整网站名称", () => {
    expect(metadata.title).toBe("周三充值日拼图互助");
    expect(metadata.description).toBe("周三充值日拼图互助大厅");
  });
});
