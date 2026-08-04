import { DomainError } from "./errors";
import type { Discount, ParsedSource, PostType } from "./types";

const INVALID_COMMAND_MESSAGE = "口令内容无法唯一识别";
const KEY_PATTERN = /￥[^￥\s]+￥/g;
const PUZZLE_PATTERN = /(95折|9折|8折)([1-9])号拼图/g;

const discountByLabel = {
  "95折": 95,
  "9折": 90,
  "8折": 80,
} as const satisfies Record<string, Discount>;

function invalidCommand(): never {
  throw new DomainError("INVALID_CONTENT", INVALID_COMMAND_MESSAGE);
}

function parseType(command: string): PostType {
  const hasGiveSignal = command.includes("送你一张");
  const hasRequestSignal =
    command.includes("还差一张") || command.includes("为我助力");

  if (hasGiveSignal === hasRequestSignal) {
    return invalidCommand();
  }

  return hasGiveSignal ? "GIVE" : "REQUEST";
}

export function parseCommand(command: string): ParsedSource {
  const keys = command.match(KEY_PATTERN) ?? [];
  const puzzleMatches = [...command.matchAll(PUZZLE_PATTERN)];

  if (keys.length !== 1 || puzzleMatches.length !== 1) {
    return invalidCommand();
  }

  const [, discountLabel, pieceNumberLabel] = puzzleMatches[0];
  const discount = discountByLabel[discountLabel as keyof typeof discountByLabel];
  const pieceNumber = Number(pieceNumberLabel);
  const maxPieceNumber = discount === 95 ? 4 : discount === 90 ? 6 : 9;

  if (pieceNumber > maxPieceNumber) {
    return invalidCommand();
  }

  return {
    type: parseType(command),
    payloadKind: "COMMAND",
    payload: keys[0],
    explicitSelection: { discount, pieceNumber },
  };
}
