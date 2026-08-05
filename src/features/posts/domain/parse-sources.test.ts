import { describe, expect, it } from "vitest";

import {
  GIVE_COMMAND,
  GIVE_URL,
  REQUEST_URL,
} from "../../../../tests/fixtures/cmcc-samples";
import { DomainError } from "./errors";
import { assertPostTypeMatches, parseSources } from "./parse-source";

describe("parseSources", () => {
  it("rejects a selected request type when content is a gift", () => {
    expect(() => assertPostTypeMatches("GIVE", "REQUEST")).toThrowError(
      "选择的是求助，但内容识别为赠送，请更换内容或发布类型",
    );
  });

  it("normalizes matching command and URL sources", () => {
    expect(
      parseSources(
        { command: GIVE_COMMAND, url: GIVE_URL },
        { discount: 80, pieceNumber: 6 },
      ),
    ).toEqual({
      type: "GIVE",
      sources: { command: "￥19uSvG￥", url: GIVE_URL },
      explicitSelection: { discount: 80, pieceNumber: 6 },
    });
  });

  it("accepts either source by itself", () => {
    expect(
      parseSources(
        { command: GIVE_COMMAND },
        { discount: 80, pieceNumber: 6 },
      ).sources,
    ).toEqual({ command: "￥19uSvG￥" });

    expect(
      parseSources(
        { url: GIVE_URL },
        { discount: 80, pieceNumber: 6 },
      ).sources,
    ).toEqual({ url: GIVE_URL });
  });

  it("rejects sources with different post types", () => {
    try {
      parseSources(
        { command: GIVE_COMMAND, url: REQUEST_URL },
        { discount: 80, pieceNumber: 6 },
      );
      throw new Error("expected parseSources to reject mismatched sources");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("SELECTION_MISMATCH");
    }
  });
});
