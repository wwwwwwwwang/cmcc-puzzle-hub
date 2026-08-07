import { describe, expect, it } from "vitest";

import { GIVE_URL } from "../../../../tests/fixtures/cmcc-samples";
import { DomainError } from "./errors";
import { assertPostTypeMatches, parseSources } from "./parse-source";

describe("parseSources", () => {
  it("returns one QR source and its identity", () => {
    const result = parseSources(
      { url: GIVE_URL },
      { discount: 80, pieceNumber: 6 },
    );

    expect(result.sources).toEqual({ url: GIVE_URL });
    expect(result.identity).toMatch(/^GIVE:/);
  });

  it("rejects an input without a QR source", () => {
    expect(() =>
      parseSources(
        { command: "￥19uSvG￥" } as never,
        { discount: 80, pieceNumber: 6 },
      ),
    ).toThrowError(new DomainError("INVALID_CONTENT", "至少提供二维码链接"));
  });

  it("rejects a selected request type when content is a gift", () => {
    expect(() => assertPostTypeMatches("GIVE", "REQUEST")).toThrowError(
      "选择的是求助，但内容识别为赠送，请更换内容或发布类型",
    );
  });
});
