import { describe, expect, it } from "vitest";

import {
  GIVE_COMMAND,
  REQUEST_COMMAND,
} from "../../../../tests/fixtures/cmcc-samples";
import { DomainError } from "./errors";
import { parseCommand } from "./parse-command";

const INVALID_COMMAND_MESSAGE = "口令内容无法唯一识别";

function expectInvalidCommand(command: string) {
  expect(() => parseCommand(command)).toThrowError(
    new DomainError("INVALID_CONTENT", INVALID_COMMAND_MESSAGE),
  );
}

describe("parseCommand", () => {
  it("parses a real give command", () => {
    expect(parseCommand(GIVE_COMMAND)).toEqual({
      type: "GIVE",
      payloadKind: "COMMAND",
      payload: "￥19uSvG￥",
      explicitSelection: { discount: 80, pieceNumber: 6 },
    });
  });

  it("parses a real request command", () => {
    expect(parseCommand(REQUEST_COMMAND)).toEqual({
      type: "REQUEST",
      payloadKind: "COMMAND",
      payload: "￥19uSvR￥",
      explicitSelection: { discount: 80, pieceNumber: 1 },
    });
  });

  it("recognizes the request type from the help signal alone", () => {
    expect(parseCommand("请为我助力‘8折1号拼图’，￥helpOnly￥").type).toBe(
      "REQUEST",
    );
  });

  it.each([
    "送你一张'95折4号拼图'，￥singleQuote￥",
    '送你一张"9折6号拼图"，￥doubleQuote￥',
    "还差一张‘8折9号拼图’，￥chineseSingleQuote￥",
    "还差一张“8折1号拼图”，￥chineseDoubleQuote￥",
  ])("accepts supported quotes in %s", (command) => {
    expect(parseCommand(command).explicitSelection).not.toBeNull();
  });

  it("rejects a command without a key", () => {
    expectInvalidCommand("送你一张‘8折6号拼图’");
  });

  it("rejects a command with multiple keys", () => {
    expectInvalidCommand(
      "送你一张‘8折6号拼图’，￥first￥，另一个￥second￥",
    );
  });

  it("rejects conflicting give and request signals", () => {
    expectInvalidCommand(
      "送你一张‘8折6号拼图’，还差一张，￥conflict￥",
    );
  });

  it("rejects a command without a type signal", () => {
    expectInvalidCommand("这是一张‘8折6号拼图’，￥missingType￥");
  });

  it("rejects a command without a puzzle selection", () => {
    expectInvalidCommand("送你一张拼图，￥missingSelection￥");
  });

  it.each([
    "送你一张‘95折5号拼图’，￥outOfRange95￥",
    "送你一张‘9折7号拼图’，￥outOfRange90￥",
    "送你一张‘8折10号拼图’，￥outOfRange80￥",
  ])("rejects an out-of-range puzzle number in %s", (command) => {
    expectInvalidCommand(command);
  });

  it("rejects multiple puzzle selections", () => {
    expectInvalidCommand(
      "送你一张‘8折1号拼图’和‘8折2号拼图’，￥ambiguousSelection￥",
    );
  });
});
