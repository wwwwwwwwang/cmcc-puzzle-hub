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
  checkPublishRateLimit,
  createPublishRateLimiter,
} from "./rate-limit";

describe("publish rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("使用每小时滑动窗口和发布命名空间", () => {
    const redis = {};

    createPublishRateLimiter(redis as never, 7);

    expect(slidingWindowSpy).toHaveBeenCalledWith(7, "1 h");
    expect(constructorSpy).toHaveBeenCalledWith({
      redis,
      limiter: "sliding-window",
      prefix: "rate:publish",
    });
  });

  it("只把 deviceHash 作为 identifier 并返回 success/reset", async () => {
    limitSpy.mockResolvedValue({ success: false, reset: 1234, remaining: 0 });
    const limiter = { limit: limitSpy };

    await expect(
      checkPublishRateLimit("device-hash", limiter),
    ).resolves.toEqual({ success: false, reset: 1234 });
    expect(limitSpy).toHaveBeenCalledWith("device-hash");
  });
});
