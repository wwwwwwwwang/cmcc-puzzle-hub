import { describe, expect, it } from "vitest";

import {
  GIVE_URL,
  REQUEST_URL,
} from "../../../../tests/fixtures/cmcc-samples";
import { DomainError } from "./errors";
import { parseUrl } from "./parse-url";

const GIVE_IDENTITY =
  "GIVE:/hlwyxhdhub/act-wedrecharge/1024101716:e728c7fc81f771f07c0491ee1afeac6c602855ea6c6ff236550705d032fa902eec43f56ac39454c76f35cef683460bb4";
const REQUEST_IDENTITY =
  "REQUEST:/hlwyxhdhub/act-wedrecharge/1024101716:e728c7fc81f771f07c0491ee1afeac6cb0618f8dc2f3627efac80efd32f018b5";

function expectInvalidUrl(value: string) {
  try {
    parseUrl(value);
    throw new Error("expected parseUrl to reject the URL");
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("INVALID_CONTENT");
  }
}

function createOuterUrl(targetUrl: string) {
  const url = new URL(
    "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html",
  );
  url.searchParams.set("targetUrl", targetUrl);
  return url.toString();
}

describe("parseUrl", () => {
  it("parses a real give URL", () => {
    expect(parseUrl(GIVE_URL)).toEqual({
      type: "GIVE",
      payloadKind: "URL",
      payload: GIVE_URL,
      explicitSelection: null,
      identity: GIVE_IDENTITY,
    });
  });

  it("parses a real request URL", () => {
    expect(parseUrl(REQUEST_URL)).toEqual({
      type: "REQUEST",
      payloadKind: "URL",
      payload: REQUEST_URL,
      explicitSelection: null,
      identity: REQUEST_IDENTITY,
    });
  });

  it("trims the valid outer URL while preserving its original representation", () => {
    expect(parseUrl(`  ${GIVE_URL}\n`).payload).toBe(GIVE_URL);
  });

  it("ignores outer tracking parameters and their order in the identity", () => {
    const original = new URL(GIVE_URL);
    const reordered = new URL(`${original.origin}${original.pathname}`);
    reordered.searchParams.set("sellerId", "different-seller");
    reordered.searchParams.set("channelId", "different-channel");
    reordered.searchParams.set("targetUrl", original.searchParams.get("targetUrl")!);
    reordered.searchParams.set("pageId", "different-page");

    expect(parseUrl(reordered.toString()).identity).toBe(GIVE_IDENTITY);
  });

  it("ignores the request phone parameter in the identity", () => {
    const outer = new URL(REQUEST_URL);
    const target = new URL(outer.searchParams.get("targetUrl")!);
    target.searchParams.set("phone", "9999");
    outer.searchParams.set("targetUrl", target.toString());

    expect(parseUrl(outer.toString()).identity).toBe(REQUEST_IDENTITY);
  });

  it("changes the identity when the business token or activity path changes", () => {
    const tokenChanged = createOuterUrl(
      "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?giveCard=another-token",
    );
    const pathChanged = createOuterUrl(
      "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/2026080712?giveCard=e728c7fc81f771f07c0491ee1afeac6c602855ea6c6ff236550705d032fa902eec43f56ac39454c76f35cef683460bb4",
    );

    expect(parseUrl(tokenChanged).identity).not.toBe(GIVE_IDENTITY);
    expect(parseUrl(pathChanged).identity).not.toBe(GIVE_IDENTITY);
  });

  it("rejects an outer HTTP URL", () => {
    expectInvalidUrl(GIVE_URL.replace("https://", "http://"));
  });

  it.each([
    GIVE_URL.replace("h.app.coc.10086.cn", "h.app.coc.10086.cn.evil.com"),
    GIVE_URL.replace(
      "https://h.app.coc.10086.cn",
      "https://h.app.coc.10086.cn@evil.com",
    ),
  ])("rejects an outer hostname bypass attempt", (url) => {
    expectInvalidUrl(url);
  });

  it("rejects an incorrect outer path", () => {
    expectInvalidUrl(
      GIVE_URL.replace(
        "/activity/zx/transit/transferDownload.html",
        "/activity/zx/transit/notTransferDownload.html",
      ),
    );
  });

  it("rejects a missing target URL", () => {
    expectInvalidUrl(
      "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html",
    );
  });

  it("rejects an unparseable target URL", () => {
    expectInvalidUrl(createOuterUrl("not a URL"));
  });

  it("rejects an inner HTTP URL", () => {
    expectInvalidUrl(
      createOuterUrl(
        "http://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?giveCard=value",
      ),
    );
  });

  it.each([
    "https://wx.10086.cn.evil.com/hlwyxhdhub/act-wedrecharge/1024101716?giveCard=value",
    "https://wx.10086.cn@evil.com/hlwyxhdhub/act-wedrecharge/1024101716?giveCard=value",
  ])("rejects an inner hostname bypass attempt", (targetUrl) => {
    expectInvalidUrl(createOuterUrl(targetUrl));
  });

  it.each([
    "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/not-digits?giveCard=value",
    "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716/extra?giveCard=value",
  ])("rejects an incorrect inner path", (targetUrl) => {
    expectInvalidUrl(createOuterUrl(targetUrl));
  });

  it("rejects both business parameters", () => {
    expectInvalidUrl(
      createOuterUrl(
        "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?giveCard=give&requestCard=request",
      ),
    );
  });

  it.each([
    "giveCard=give&requestCard=",
    "giveCard=&requestCard=request",
  ])("rejects a second empty business parameter in %s", (query) => {
    expectInvalidUrl(
      createOuterUrl(
        `https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?${query}`,
      ),
    );
  });

  it("rejects a missing business parameter", () => {
    expectInvalidUrl(
      createOuterUrl(
        "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?phone=1307",
      ),
    );
  });

  it.each(["giveCard", "requestCard"])(
    "rejects an empty %s parameter",
    (parameter) => {
      expectInvalidUrl(
        createOuterUrl(
          `https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?${parameter}=`,
        ),
      );
    },
  );

  it("rejects duplicate business parameters of the same type", () => {
    expectInvalidUrl(
      createOuterUrl(
        "https://wx.10086.cn/hlwyxhdhub/act-wedrecharge/1024101716?giveCard=first&giveCard=second",
      ),
    );
  });

  it.each(["", "not a URL", "://missing-protocol.example"])(
    "rejects malformed URL %j",
    (url) => {
      expectInvalidUrl(url);
    },
  );
});
