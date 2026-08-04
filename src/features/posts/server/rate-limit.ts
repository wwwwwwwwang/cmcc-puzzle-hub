import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

import { getRedis } from "./redis";

type PublishRateLimiter = Pick<Ratelimit, "limit">;

let publishRateLimiter: PublishRateLimiter | null = null;

export function createPublishRateLimiter(
  redis: Redis,
  limit = Number(process.env.PUBLISH_LIMIT_PER_HOUR ?? 10),
) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("PUBLISH_LIMIT_PER_HOUR must be a positive integer");
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 h"),
    prefix: "rate:publish",
  });
}

function getPublishRateLimiter() {
  publishRateLimiter ??= createPublishRateLimiter(getRedis());
  return publishRateLimiter;
}

export async function checkPublishRateLimit(
  deviceHash: string,
  limiter: PublishRateLimiter = getPublishRateLimiter(),
) {
  const result = await limiter.limit(deviceHash);
  return { success: result.success, reset: result.reset };
}
