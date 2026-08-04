import { Redis } from "@upstash/redis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const testUrl = process.env.TEST_UPSTASH_REDIS_REST_URL;
const testToken = process.env.TEST_UPSTASH_REDIS_REST_TOKEN;
const hasTestCredentials = Boolean(testUrl && testToken);
const suite = hasTestCredentials ? describe : describe.skip;

suite(
  hasTestCredentials
    ? "atomic post claim Upstash integration"
    : "atomic post claim Upstash integration (skipped: TEST_UPSTASH_REDIS_REST_URL/TOKEN 未配置)",
  () => {
    let redis: Redis;
    let repository: typeof import("./post-repository");
    let keys: typeof import("./keys");
    const explicitKeys = new Set<string>();
    const suitePrefix = `${process.env.TEST_REDIS_PREFIX ?? "test:claims"}:${crypto.randomUUID()}`;

    beforeAll(async () => {
      redis = new Redis({ url: testUrl!, token: testToken! });
      repository = await import("./post-repository");
      keys = await import("./keys");
    });

    afterAll(async () => {
      if (explicitKeys.size > 0) await redis.del(...explicitKeys);
    });

    it("20 轮并发领取均只有一个赢家并支持同设备幂等", async () => {
      for (let round = 0; round < 20; round += 1) {
        const prefix = `${suitePrefix}:${round}`;
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 86_400_000);
        const uuid = `00000000-0000-4000-8000-${String(round + 1).padStart(12, "0")}`;
        const id = `p_${expiresAt.getTime()}_${uuid}`;
        const payloadHash = `payload-${round}-${crypto.randomUUID()}`;
        const publisherDeviceHash = `publisher-${round}`;
        const indexKeys = [
          keys.allIndexKey(prefix),
          keys.typeIndexKey("GIVE", prefix),
          keys.discountIndexKey(95, prefix),
          keys.typeDiscountIndexKey("GIVE", 95, prefix),
        ];
        const postRedisKey = keys.postKey(id, prefix);
        const dedupeRedisKey = keys.dedupeKey(payloadHash, prefix);
        const claimRedisKey = keys.claimKey(id, prefix);
        [postRedisKey, dedupeRedisKey, claimRedisKey, ...indexKeys].forEach((key) =>
          explicitKeys.add(key),
        );

        const published = await repository.publishPost(
          {
            type: "GIVE",
            discount: 95,
            pieceNumber: 1,
            payloadKind: "COMMAND",
            payload: `secret-command-${round}`,
            publisherDeviceHash,
            payloadHash,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          { redis, prefix, randomUUID: () => uuid },
        );
        expect(published.status).toBe("CREATED");

        await expect(
          repository.claimPost(id, publisherDeviceHash, { redis, prefix }),
        ).resolves.toEqual({ status: "SELF_CLAIM_FORBIDDEN" });
        expect(await redis.get(postRedisKey)).not.toBeNull();
        for (const indexKey of indexKeys) {
          expect(await redis.zscore(indexKey, id)).not.toBeNull();
        }

        const claimantA = `claimant-a-${round}`;
        const claimantB = `claimant-b-${round}`;
        const concurrent = await Promise.all([
          repository.claimPost(id, claimantA, { redis, prefix }),
          repository.claimPost(id, claimantB, { redis, prefix }),
        ]);
        const winner = concurrent.find((result) => result.status === "CLAIMED");
        const loser = concurrent.find((result) => result.status === "ALREADY_CLAIMED");

        expect(winner).toMatchObject({
          status: "CLAIMED",
          payloadKind: "COMMAND",
          payload: `secret-command-${round}`,
          idempotent: false,
        });
        expect(loser).toEqual({ status: "ALREADY_CLAIMED" });
        if (!winner || winner.status !== "CLAIMED") throw new Error("missing winner");
        const winnerHash = concurrent[0] === winner ? claimantA : claimantB;

        await expect(
          repository.claimPost(id, winnerHash, { redis, prefix }),
        ).resolves.toMatchObject({
          status: "CLAIMED",
          payload: `secret-command-${round}`,
          idempotent: true,
        });
        await expect(
          repository.claimPost(id, `claimant-c-${round}`, { redis, prefix }),
        ).resolves.toEqual({ status: "ALREADY_CLAIMED" });

        expect(await redis.ttl(claimRedisKey)).toBeGreaterThanOrEqual(290);
        expect(await redis.ttl(claimRedisKey)).toBeLessThanOrEqual(300);
        expect(await redis.get(postRedisKey)).toBeNull();
        for (const indexKey of indexKeys) {
          expect(await redis.zscore(indexKey, id)).toBeNull();
        }
        expect(await redis.get(dedupeRedisKey)).not.toBeNull();
      }
    });

    it("无详情和回执时依据 ID 到期时间区分状态", async () => {
      const prefix = `${suitePrefix}:missing`;
      const pastId = `p_${Date.now() - 1}_00000000-0000-4000-8000-000000000101`;
      const futureId = `p_${Date.now() + 60_000}_00000000-0000-4000-8000-000000000102`;

      await expect(
        repository.claimPost(pastId, "claimant", { redis, prefix }),
      ).resolves.toEqual({ status: "EXPIRED" });
      await expect(
        repository.claimPost(futureId, "claimant", { redis, prefix }),
      ).resolves.toEqual({ status: "ALREADY_CLAIMED" });
    });
  },
);
