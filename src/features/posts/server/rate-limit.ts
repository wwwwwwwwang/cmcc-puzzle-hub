import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

import { getRedis } from "./redis";

type RateLimiter = Pick<Ratelimit, "limit">;

let publishHourlyLimiter: RateLimiter | null = null;
let publishDailyLimiter: RateLimiter | null = null;
let claimDailyLimiter: RateLimiter | null = null;
let hallMinuteLimiter: RateLimiter | null = null;

function positiveIntFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function createPublishRateLimiter(
  redis: Redis,
  limit = positiveIntFromEnv("PUBLISH_LIMIT_PER_HOUR", 30),
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 h"),
    prefix: "rate:publish",
  });
}

export function createDailyPublishRateLimiter(
  redis: Redis,
  limit = positiveIntFromEnv("PUBLISH_LIMIT_PER_DAY", 30),
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 d"),
    prefix: "rate:publish:day",
  });
}

export function createDailyClaimRateLimiter(
  redis: Redis,
  limit = positiveIntFromEnv("CLAIM_LIMIT_PER_DAY", 10),
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 d"),
    prefix: "rate:claim:day",
  });
}

export function createRegistrationRateLimiter(
  redis: Redis,
  limit = positiveIntFromEnv("REGISTER_LIMIT_PER_DAY_PER_IP", 3),
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 d"),
    prefix: "rate:register:ip",
  });
}

export function createHallRateLimiter(
  redis: Redis,
  limit = positiveIntFromEnv("HALL_LIMIT_PER_MINUTE", 120),
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 m"),
    prefix: "rate:hall:minute",
  });
}

function getPublishHourlyLimiter() {
  publishHourlyLimiter ??= createPublishRateLimiter(getRedis());
  return publishHourlyLimiter;
}

function getPublishDailyLimiter() {
  publishDailyLimiter ??= createDailyPublishRateLimiter(getRedis());
  return publishDailyLimiter;
}

function getClaimDailyLimiter() {
  claimDailyLimiter ??= createDailyClaimRateLimiter(getRedis());
  return claimDailyLimiter;
}

let registrationLimiter: RateLimiter | null = null;

function getRegistrationLimiter() {
  registrationLimiter ??= createRegistrationRateLimiter(getRedis());
  return registrationLimiter;
}

function getHallLimiter() {
  hallMinuteLimiter ??= createHallRateLimiter(getRedis());
  return hallMinuteLimiter;
}

/**
 * 注册限流:每 IP 每日上限(默认 3),防脚本批量注册。仅信号级,不当身份。
 */
export async function checkRegistrationRateLimit(
  ip: string,
  limiter: RateLimiter = getRegistrationLimiter(),
): Promise<LimitResult> {
  const result = await limiter.limit(`ip:${ip}`);
  return { success: result.success, reset: result.reset };
}

type LimitResult = { success: boolean; reset: number };

/**
 * 发布限流:按用户同时校验每小时与每日上限,任一超限即拒绝。
 */
export async function checkPublishRateLimit(
  userId: string,
  limiters: { hourly?: RateLimiter; daily?: RateLimiter } = {},
): Promise<LimitResult> {
  const hourly = limiters.hourly ?? getPublishHourlyLimiter();
  const daily = limiters.daily ?? getPublishDailyLimiter();

  const [hourlyResult, dailyResult] = await Promise.all([
    hourly.limit(userId),
    daily.limit(`${userId}`),
  ]);

  const success = hourlyResult.success && dailyResult.success;
  const reset = Math.max(hourlyResult.reset, dailyResult.reset);
  return { success, reset };
}

/**
 * 领取限流:按用户与 IP 双维度每日上限,任一超限即拒绝。
 */
export async function checkClaimRateLimit(
  userId: string,
  ip: string,
  limiter: RateLimiter = getClaimDailyLimiter(),
): Promise<LimitResult> {
  const [userResult, ipResult] = await Promise.all([
    limiter.limit(`user:${userId}`),
    limiter.limit(`ip:${ip}`),
  ]);

  const success = userResult.success && ipResult.success;
  const reset = Math.max(userResult.reset, ipResult.reset);
  return { success, reset };
}

/**
 * 大厅读取限流:按 IP 每分钟限制，避免匿名脚本持续消耗数据库和免费额度。
 */
export async function checkHallRateLimit(
  ip: string,
  limiter: RateLimiter = getHallLimiter(),
): Promise<LimitResult> {
  const result = await limiter.limit(`ip:${ip}`);
  return { success: result.success, reset: result.reset };
}
