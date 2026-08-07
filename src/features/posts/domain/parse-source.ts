import { DomainError } from "./errors";
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
  { kind: "URL"; value: string };

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
  void selection;
  return parseUrl(source.value);
}

export function parseSources(
  sources: PostSources,
  selection: PuzzleSelection,
): ParsedSources {
  if (!sources.url) {
    throw new DomainError("INVALID_CONTENT", "至少提供二维码链接");
  }

  const url = parseSource({ kind: "URL", value: sources.url }, selection);

  return {
    type: url.type,
    sources: { url: url.payload },
    explicitSelection: null,
    identity: url.identity,
  };
}
