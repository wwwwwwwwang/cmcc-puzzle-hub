import { DomainError } from "./errors";
import type { ParsedSource, PostType } from "./types";

const OUTER_HOSTNAME = "h.app.coc.10086.cn";
const OUTER_PATHNAME = "/activity/zx/transit/transferDownload.html";
const INNER_HOSTNAME = "wx.10086.cn";
const INNER_PATH_PATTERN = /^\/hlwyxhdhub\/act-wedrecharge\/\d+$/;

function invalidUrl(): never {
  throw new DomainError("INVALID_CONTENT", "链接内容无效");
}

function parseBusinessType(targetUrl: URL): PostType {
  const giveCards = targetUrl.searchParams.getAll("giveCard");
  const requestCards = targetUrl.searchParams.getAll("requestCard");
  const businessParameterCount = giveCards.length + requestCards.length;

  if (businessParameterCount !== 1) {
    return invalidUrl();
  }

  if (giveCards.length === 1) {
    return giveCards[0] === "" ? invalidUrl() : "GIVE";
  }

  return requestCards[0] === "" ? invalidUrl() : "REQUEST";
}

export function parseUrl(value: string): ParsedSource {
  const payload = value.trim();

  try {
    const outerUrl = new URL(payload);

    if (
      outerUrl.protocol !== "https:" ||
      outerUrl.hostname !== OUTER_HOSTNAME ||
      outerUrl.pathname !== OUTER_PATHNAME
    ) {
      return invalidUrl();
    }

    const targetUrlValue = outerUrl.searchParams.get("targetUrl");

    if (targetUrlValue === null || targetUrlValue === "") {
      return invalidUrl();
    }

    const targetUrl = new URL(targetUrlValue);

    if (
      targetUrl.protocol !== "https:" ||
      targetUrl.hostname !== INNER_HOSTNAME ||
      !INNER_PATH_PATTERN.test(targetUrl.pathname)
    ) {
      return invalidUrl();
    }

    return {
      type: parseBusinessType(targetUrl),
      payloadKind: "URL",
      payload,
      explicitSelection: null,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    return invalidUrl();
  }
}
