import "server-only";

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function getRedis() {
  redis ??= Redis.fromEnv();
  return redis;
}
