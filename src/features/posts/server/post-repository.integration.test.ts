import { randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const testUrl = process.env.TEST_UPSTASH_REDIS_REST_URL;
const testToken = process.env.TEST_UPSTASH_REDIS_REST_TOKEN;
const hasTestCredentials = Boolean(testUrl && testToken);
const suite = hasTestCredentials ? describe : describe.skip;

suite(
  hasTestCredentials
    ? "post repository Upstash integration"
    : "post repository Upstash integration (skipped: TEST_UPSTASH_REDIS_REST_URL/TOKEN 未配置)",
  () => {
    const prefix = `${process.env.TEST_REDIS_PREFIX ?? "test:posts"}:${randomUUID()}`;
    let redis: Redis;
    const explicitKeys = new Set<string>();
    let repository: typeof import("./post-repository");
    let keys: typeof import("./keys");

    beforeAll(async () => {
      redis = new Redis({ url: testUrl!, token: testToken! });
      repository = await import("./post-repository");
      keys = await import("./keys");
    });

    afterAll(async () => {
      if (explicitKeys.size > 0) {
        await redis.del(...explicitKeys);
      }
    });

    it("原子发布设置 TTL、四个索引和去重", async () => {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 86_400_000);
      const input = {
        type: "GIVE" as const,
        discount: 95 as const,
        pieceNumber: 1,
        payloadKind: "COMMAND" as const,
        payload: "integration-secret-command",
        publisherDeviceHash: randomUUID(),
        payloadHash: randomUUID(),
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      const firstUuid = "00000000-0000-4000-8000-000000000001";
      const firstId = `p_${expiresAt.getTime()}_${firstUuid}`;
      const dedupeRedisKey = keys.dedupeKey(input.payloadHash, prefix);
      const indexKeys = [
        keys.allIndexKey(prefix),
        keys.typeIndexKey(input.type, prefix),
        keys.discountIndexKey(input.discount, prefix),
        keys.typeDiscountIndexKey(input.type, input.discount, prefix),
      ];
      [keys.postKey(firstId, prefix), dedupeRedisKey, ...indexKeys].forEach((key) =>
        explicitKeys.add(key),
      );

      const first = await repository.publishPost(input, {
        redis,
        prefix,
        randomUUID: () => firstUuid,
      });
      expect(first.status).toBe("CREATED");
      if (first.status !== "CREATED") throw new Error("expected created post");

      const postRedisKey = keys.postKey(first.post.id, prefix);

      expect(await redis.ttl(postRedisKey)).toBeGreaterThanOrEqual(86_390);
      expect(await redis.ttl(postRedisKey)).toBeLessThanOrEqual(86_400);
      expect(await redis.ttl(dedupeRedisKey)).toBeGreaterThanOrEqual(86_390);
      expect(await redis.ttl(dedupeRedisKey)).toBeLessThanOrEqual(86_400);
      for (const indexKey of indexKeys) {
        expect(await redis.zscore(indexKey, first.post.id)).not.toBeNull();
      }

      await expect(repository.publishPost(input, { redis, prefix })).resolves.toEqual({
        status: "DUPLICATE_POST",
      });

      const page = await repository.listPosts(
        { type: "GIVE", discount: 95 },
        { redis, prefix },
      );
      expect(page.items[0]).not.toHaveProperty("payload");
      expect(page.items[0]).not.toHaveProperty("publisherDeviceHash");
      expect(page.items[0]).not.toHaveProperty("payloadHash");

      const otherInputs = [
        {
          ...input,
          type: "REQUEST" as const,
          payload: "integration-request-command",
          payloadHash: randomUUID(),
        },
        {
          ...input,
          discount: 80 as const,
          pieceNumber: 9,
          payload: "integration-80-command",
          payloadHash: randomUUID(),
        },
      ];

      for (const [index, otherInput] of otherInputs.entries()) {
        const uuid = `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`;
        const id = `p_${expiresAt.getTime()}_${uuid}`;
        [
          keys.postKey(id, prefix),
          keys.dedupeKey(otherInput.payloadHash, prefix),
          keys.allIndexKey(prefix),
          keys.typeIndexKey(otherInput.type, prefix),
          keys.discountIndexKey(otherInput.discount, prefix),
          keys.typeDiscountIndexKey(
            otherInput.type,
            otherInput.discount,
            prefix,
          ),
        ].forEach((key) => explicitKeys.add(key));

        const result = await repository.publishPost(otherInput, {
          redis,
          prefix,
          randomUUID: () => uuid,
        });
        expect(result.status).toBe("CREATED");
        if (result.status !== "CREATED") throw new Error("expected created post");
      }

      const give95 = await repository.listPosts(
        { type: "GIVE", discount: 95 },
        { redis, prefix },
      );
      const request95 = await repository.listPosts(
        { type: "REQUEST", discount: 95 },
        { redis, prefix },
      );
      const give80 = await repository.listPosts(
        { type: "GIVE", discount: 80 },
        { redis, prefix },
      );

      expect(give95.items).toHaveLength(1);
      expect(request95.items).toHaveLength(1);
      expect(give80.items).toHaveLength(1);
      expect(give95.items[0]).toMatchObject({ type: "GIVE", discount: 95 });
      expect(request95.items[0]).toMatchObject({ type: "REQUEST", discount: 95 });
      expect(give80.items[0]).toMatchObject({ type: "GIVE", discount: 80 });
    });
  },
);
