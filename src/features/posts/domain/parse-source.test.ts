import { describe, expect, it } from "vitest";

import {
  GIVE_COMMAND,
  GIVE_URL,
} from "../../../../tests/fixtures/cmcc-samples";
import { DomainError } from "./errors";
import { parseSource } from "./parse-source";

function expectSelectionMismatch(selection: {
  discount: 95 | 90 | 80;
  pieceNumber: number;
}) {
  try {
    parseSource({ kind: "COMMAND", value: GIVE_COMMAND }, selection);
    throw new Error("expected parseSource to reject the selection");
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("SELECTION_MISMATCH");
  }
}

describe("parseSource", () => {
  it("returns a parsed command when the selection matches", () => {
    expect(
      parseSource(
        { kind: "COMMAND", value: GIVE_COMMAND },
        { discount: 80, pieceNumber: 6 },
      ),
    ).toEqual({
      type: "GIVE",
      payloadKind: "COMMAND",
      payload: "￥19uSvG￥",
      explicitSelection: { discount: 80, pieceNumber: 6 },
    });
  });

  it("rejects a command whose discount differs from the selection", () => {
    expectSelectionMismatch({ discount: 90, pieceNumber: 6 });
  });

  it("rejects a command whose piece number differs from the selection", () => {
    expectSelectionMismatch({ discount: 80, pieceNumber: 5 });
  });

  it("parses a URL without replacing its null explicit selection", () => {
    expect(
      parseSource(
        { kind: "URL", value: GIVE_URL },
        { discount: 95, pieceNumber: 4 },
      ),
    ).toEqual({
      type: "GIVE",
      payloadKind: "URL",
      payload: GIVE_URL,
      explicitSelection: null,
    });
  });
});
