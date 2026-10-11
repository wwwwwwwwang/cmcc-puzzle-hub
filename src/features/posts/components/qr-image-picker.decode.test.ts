import { describe, expect, it } from "vitest";

import { getDecodeDimensions, MAX_QR_DECODE_EDGE } from "./qr-image-picker";

describe("二维码解码尺寸", () => {
  it("小图保持原始尺寸", () => {
    expect(getDecodeDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("大图按最长边缩放到上限", () => {
    expect(getDecodeDimensions(4000, 3000)).toEqual({
      width: MAX_QR_DECODE_EDGE,
      height: 1200,
    });
    expect(getDecodeDimensions(3000, 4000)).toEqual({
      width: 1200,
      height: MAX_QR_DECODE_EDGE,
    });
  });

  it("非法尺寸抛出错误", () => {
    expect(() => getDecodeDimensions(0, 100)).toThrow();
  });
});
