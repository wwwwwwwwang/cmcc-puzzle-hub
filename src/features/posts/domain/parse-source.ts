import { DomainError } from "./errors";
import { parseCommand } from "./parse-command";
import { parseUrl } from "./parse-url";
import type {
  ParsedSource,
  ParsedSources,
  PostType,
  PostSources,
  PuzzleSelection,
} from "./types";

const postTypeLabel = { GIVE: "赠送", REQUEST: "求助" } as const;

type PostSource =
  | { kind: "COMMAND"; value: string }
  | { kind: "URL"; value: string };

export function assertPostTypeMatches(
  actualType: PostType,
  selectedType: PostType,
) {
  if (actualType === selectedType) return;

  throw new DomainError(
    "TYPE_MISMATCH",
    `选择的是${postTypeLabel[selectedType]}，但内容识别为${postTypeLabel[actualType]}，请更换内容或发布类型`,
  );
}

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

export function parseSources(
  sources: PostSources,
  selection: PuzzleSelection,
): ParsedSources {
  const command = sources.command
    ? parseSource({ kind: "COMMAND", value: sources.command }, selection)
    : null;
  const url = sources.url
    ? parseSource({ kind: "URL", value: sources.url }, selection)
    : null;

  if (!command && !url) {
    throw new DomainError("INVALID_CONTENT", "至少提供一种拼图来源");
  }
  if (command && url && command.type !== url.type) {
    throw new DomainError(
      "SELECTION_MISMATCH",
      "口令与二维码对应的拼图类型不一致",
    );
  }

  return {
    type: (command ?? url)!.type,
    sources: {
      ...(command ? { command: command.payload } : {}),
      ...(url ? { url: url.payload } : {}),
    },
    explicitSelection: command?.explicitSelection ?? null,
    identity: url?.identity ?? null,
  };
}
