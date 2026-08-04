import { DomainError } from "./errors";
import { parseCommand } from "./parse-command";
import { parseUrl } from "./parse-url";
import type { ParsedSource, PuzzleSelection } from "./types";

type PostSource =
  | { kind: "COMMAND"; value: string }
  | { kind: "URL"; value: string };

export function parseSource(
  source: PostSource,
  selection: PuzzleSelection,
): ParsedSource {
  if (source.kind === "URL") {
    return parseUrl(source.value);
  }

  const parsedSource = parseCommand(source.value);
  const explicitSelection = parsedSource.explicitSelection;

  if (
    explicitSelection === null ||
    explicitSelection.discount !== selection.discount ||
    explicitSelection.pieceNumber !== selection.pieceNumber
  ) {
    throw new DomainError("SELECTION_MISMATCH", "口令拼图与当前选择不一致");
  }

  return parsedSource;
}
