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
      identity:
        "GIVE:/hlwyxhdhub/act-wedrecharge/1024101716:e728c7fc81f771f07c0491ee1afeac6c602855ea6c6ff236550705d032fa902eec43f56ac39454c76f35cef683460bb4",
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
        { command: GIVE_COMMAND },
        { discount: 80, pieceNumber: 6 },
      ).identity,
    ).toBeNull();

    expect(
      parseSources(
        { url: GIVE_URL },
        { discount: 80, pieceNumber: 6 },
      ).sources,
    ).toEqual({ url: GIVE_URL });

    expect(
      parseSources(
        { url: GIVE_URL },
        { discount: 80, pieceNumber: 6 },
      ).identity,
    ).toMatch(/^GIVE:/);
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
