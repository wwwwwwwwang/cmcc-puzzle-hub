import { describe, expect, it } from "vitest";

import { GIVE_URL } from "../../../../tests/fixtures/cmcc-samples";
import { parseSource } from "./parse-source";

describe("parseSource", () => {
  it("parses a QR URL and retains its canonical identity", () => {
    const result = parseSource(
      { kind: "URL", value: GIVE_URL },
      { discount: 80, pieceNumber: 6 },
    );

    expect(result.type).toBe("GIVE");
    expect(result.payloadKind).toBe("URL");
    expect(result.payload).toBe(GIVE_URL);
    expect(result.identity).toMatch(/^GIVE:/);
  });
});
