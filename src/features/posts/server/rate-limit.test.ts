import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { constructorSpy, slidingWindowSpy, limitSpy } = vi.hoisted(() => ({
  constructorSpy: vi.fn(),
  slidingWindowSpy: vi.fn(() => "sliding-window"),
  limitSpy: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow = slidingWindowSpy;
    limit = limitSpy;

    constructor(config: unknown) {
      constructorSpy(config);
    }
  },
}));

import {
  checkClaimRateLimit,
  checkPublishRateLimit,
  createDailyClaimRateLimiter,
  createDailyPublishRateLimiter,
  createPublishRateLimiter,
} from "./rate-limit";

describe("rate limit 构造", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("每小时发布限流用 1h 窗口与 rate:publish 前缀", () => {
    const redis = {};
    createPublishRateLimiter(redis as never, 7);
    expect(slidingWindowSpy).toHaveBeenCalledWith(7, "1 h");
    expect(constructorSpy).toHaveBeenCalledWith({
      redis,
      limiter: "sliding-window",
      prefix: "rate:publish",
    });
  });

  it("每小时发布限流默认上限为 30", () => {
    createPublishRateLimiter({} as never);
    expect(slidingWindowSpy).toHaveBeenCalledWith(30, "1 h");
  });

  it("每日发布限流用 1d 窗口与 rate:publish:day 前缀", () => {
    const redis = {};
    createDailyPublishRateLimiter(redis as never, 10);
    expect(slidingWindowSpy).toHaveBeenCalledWith(10, "1 d");
    expect(constructorSpy).toHaveBeenCalledWith({
      redis,
      limiter: "sliding-window",
      prefix: "rate:publish:day",
    });
  });

  it("每日发布限流默认上限为 30", () => {
    createDailyPublishRateLimiter({} as never);
    expect(slidingWindowSpy).toHaveBeenCalledWith(30, "1 d");
  });

  it("每日领取限流用 1d 窗口与 rate:claim:day 前缀", () => {
    const redis = {};
    createDailyClaimRateLimiter(redis as never, 10);
    expect(slidingWindowSpy).toHaveBeenCalledWith(10, "1 d");
    expect(constructorSpy).toHaveBeenCalledWith({
      redis,
      limiter: "sliding-window",
      prefix: "rate:claim:day",
    });
  });
});

describe("checkPublishRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("小时或每日任一超限即失败,reset 取较大值", async () => {
    const hourly = { limit: vi.fn(async () => ({ success: true, reset: 100 })) };
    const daily = { limit: vi.fn(async () => ({ success: false, reset: 500 })) };
    await expect(
      checkPublishRateLimit("user-1", {
        hourly: hourly as never,
        daily: daily as never,
      }),
    ).resolves.toEqual({ success: false, reset: 500 });
    expect(hourly.limit).toHaveBeenCalledWith("user-1");
    expect(daily.limit).toHaveBeenCalledWith("user-1");
  });
});

describe("checkClaimRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("按 user 与 ip 双维度校验,任一超限即失败", async () => {
    const limiter = {
      limit: vi
        .fn()
        .mockResolvedValueOnce({ success: true, reset: 10 })
        .mockResolvedValueOnce({ success: false, reset: 20 }),
    };
    await expect(
      checkClaimRateLimit("user-1", "1.2.3.4", limiter as never),
    ).resolves.toEqual({ success: false, reset: 20 });
    expect(limiter.limit).toHaveBeenCalledWith("user:user-1");
    expect(limiter.limit).toHaveBeenCalledWith("ip:1.2.3.4");
  });
});
