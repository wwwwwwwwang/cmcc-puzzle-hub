import "server-only";

import type {
  Discount,
  HallPostDto,
  PostType,
  StoredPost,
} from "../domain/types";
import { toPublicDeviceId } from "../device/public-id";
import {
  allIndexKey,
  claimKey,
  createPostId,
  dedupeKey,
  discountIndexKey,
  postKey,
  parsePostId,
  typeDiscountIndexKey,
  typeIndexKey,
} from "./keys";
import { CLAIM_POST_SCRIPT } from "./claim-script";
import { getRedis } from "./redis";

const POST_TTL_SECONDS = 86_400;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;
const READ_BATCH_SIZE = 40;
const ORPHAN_CLEANUP_BATCH_SIZE = 40;
const CLAIM_RECEIPT_TTL_SECONDS = 300;

export const PUBLISH_POST_SCRIPT = `
local dedupeCount = tonumber(ARGV[2])

for index = 2, dedupeCount + 1 do
  if redis.call("EXISTS", KEYS[index]) == 1 then
    return "DUPLICATE"
  end
end

for index = 2, dedupeCount + 1 do
  redis.call("SET", KEYS[index], "1", "EX", ARGV[3])
end

redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
for index = dedupeCount + 2, #KEYS do
  redis.call("ZADD", KEYS[index], ARGV[4], ARGV[5])
end

return "CREATED"
`;

type ZRangeOptions = {
  byScore: true;
  rev: true;
  withScores: true;
  offset: number;
  count: number;
};

export type PostRedis = {
  eval: (
    script: string,
    keys: string[],
    args: string[],
  ) => Promise<unknown>;
  zrange: (
    key: string,
    max: number | `(${number}` | "-inf" | "+inf",
    min: number | `(${number}` | "-inf" | "+inf",
    options: ZRangeOptions,
  ) => Promise<(string | number)[]>;
  mget: (...keys: string[]) => Promise<(StoredPost | null)[]>;
  zrem: (key: string, ...members: string[]) => Promise<number>;
  zremrangebyscore: (
    key: string,
    min: number | "-inf" | "+inf",
    max: number | "-inf" | "+inf",
  ) => Promise<number>;
};

type RepositoryOptions = {
  redis?: PostRedis;
  prefix?: string;
  randomUUID?: () => string;
  now?: () => number;
};

type PublishPostResult =
  | { status: "CREATED"; post: StoredPost }
  | { status: "DUPLICATE_POST" };

export type ListPostFilters = {
  type?: PostType;
  discount?: Discount;
  pieceNumber?: number;
  cursor?: string;
  limit?: number;
};

export type HallPostPage = {
  items: HallPostDto[];
  nextCursor: string | null;
};

export type ClaimPostResult =
  | {
      status: "CLAIMED";
      payloads: StoredPost["payloads"];
      idempotent: boolean;
    }
  | { status: "SELF_CLAIM_FORBIDDEN" }
  | { status: "ALREADY_CLAIMED" }
  | { status: "EXPIRED" }
  | { status: "INVALID_POST_ID" };

type Cursor = { score: number; id: string };
type ScoredPostId = Cursor;

export async function publishPost(
  post: Omit<StoredPost, "id">,
  options: RepositoryOptions = {},
): Promise<PublishPostResult> {
  const redis: PostRedis = options.redis ?? getRedis();
  const expiresAtMillis = Date.parse(post.expiresAt);
  const createdAtMillis = Date.parse(post.createdAt);

  if (!Number.isFinite(expiresAtMillis) || !Number.isFinite(createdAtMillis)) {
    throw new Error("Post timestamps must be valid ISO dates");
  }

  const storedPost: StoredPost = {
    ...post,
    id: createPostId(expiresAtMillis, options.randomUUID),
  };
  const result = await redis.eval(
    PUBLISH_POST_SCRIPT,
    [
      postKey(storedPost.id, options.prefix),
      ...Object.values(storedPost.payloadHashes).map((hash) =>
        dedupeKey(hash, options.prefix),
      ),
      allIndexKey(options.prefix),
      typeIndexKey(storedPost.type, options.prefix),
      discountIndexKey(storedPost.discount, options.prefix),
      typeDiscountIndexKey(storedPost.type, storedPost.discount, options.prefix),
    ],
    [
      JSON.stringify(storedPost),
      String(Object.keys(storedPost.payloadHashes).length),
      String(POST_TTL_SECONDS),
      String(createdAtMillis),
      storedPost.id,
    ],
  );

  if (result === "DUPLICATE") {
    return { status: "DUPLICATE_POST" };
  }
  if (result !== "CREATED") {
    throw new Error("Unexpected publish script result");
  }

  return { status: "CREATED", post: storedPost };
}

export async function listPosts(
  filters: ListPostFilters = {},
  options: RepositoryOptions = {},
): Promise<HallPostPage> {
  const redis: PostRedis = options.redis ?? getRedis();
  const indexKey = selectIndexKey(filters, options.prefix);
  const pageSize = normalizePageSize(filters.limit);
  const cursor = decodeCursor(filters.cursor);
  const collected: ScoredPostId[] = [];
  const posts = new Map<string, StoredPost>();
  const orphanIds: string[] = [];
  let offset = 0;
  let exhausted = false;

  await redis.zremrangebyscore(
    indexKey,
    "-inf",
    Date.now() - POST_TTL_SECONDS * 1000,
  );

  while (collected.length < pageSize + 1 && !exhausted) {
    const rawEntries = await redis.zrange(
      indexKey,
      cursor?.score ?? "+inf",
      "-inf",
      {
        byScore: true,
        rev: true,
        withScores: true,
        offset,
        count: READ_BATCH_SIZE,
      },
    );
    const entries = toScoredPostIds(rawEntries).filter((entry) =>
      isAfterCursor(entry, cursor),
    );

    exhausted = rawEntries.length < READ_BATCH_SIZE * 2;
    offset += READ_BATCH_SIZE;
    if (entries.length === 0) {
      if (exhausted) break;
      continue;
    }

    const values = await redis.mget(
      ...entries.map(({ id }) => postKey(id, options.prefix)),
    );
    entries.forEach((entry, index) => {
      const storedPost = normalizeStoredPost(values[index]);
      if (!storedPost) {
        orphanIds.push(entry.id);
        return;
      }
      if (
        filters.pieceNumber !== undefined &&
        storedPost.pieceNumber !== filters.pieceNumber
      ) {
        return;
      }
      posts.set(entry.id, storedPost);
      collected.push(entry);
    });
  }

  if (orphanIds.length > 0) {
    await cleanupOrphans(redis, orphanIds, options.prefix);
  }

  const pageEntries = collected.slice(0, pageSize);
  const items = pageEntries.flatMap(({ id }) => {
    const post = posts.get(id);
    return post ? [toHallPostDto(post)] : [];
  });
  const hasMore = collected.length > pageSize || !exhausted;
  const lastEntry = pageEntries.at(-1);

  return {
    items,
    nextCursor: hasMore && lastEntry ? encodeCursor(lastEntry) : null,
  };
}

export async function claimPost(
  id: string,
  claimantDeviceHash: string,
  options: RepositoryOptions = {},
): Promise<ClaimPostResult> {
  const parsedId = parsePostId(id);
  if (!parsedId) return { status: "INVALID_POST_ID" };

  const redis: PostRedis = options.redis ?? getRedis();
  const result = await redis.eval(
    CLAIM_POST_SCRIPT,
    [
      claimKey(id, options.prefix),
      postKey(id, options.prefix),
      allIndexKey(options.prefix),
      typeIndexKey("GIVE", options.prefix),
      typeIndexKey("REQUEST", options.prefix),
      discountIndexKey(95, options.prefix),
      discountIndexKey(90, options.prefix),
      discountIndexKey(80, options.prefix),
      typeDiscountIndexKey("GIVE", 95, options.prefix),
      typeDiscountIndexKey("GIVE", 90, options.prefix),
      typeDiscountIndexKey("GIVE", 80, options.prefix),
      typeDiscountIndexKey("REQUEST", 95, options.prefix),
      typeDiscountIndexKey("REQUEST", 90, options.prefix),
      typeDiscountIndexKey("REQUEST", 80, options.prefix),
    ],
    [
      claimantDeviceHash,
      String(CLAIM_RECEIPT_TTL_SECONDS),
      id,
      String((options.now ?? Date.now)()),
      String(parsedId.expiresAtMillis),
      options.prefix ? `${options.prefix}:dedupe:` : "dedupe:",
    ],
  );

  return parseClaimResult(result);
}

function selectIndexKey(filters: ListPostFilters, prefix?: string) {
  if (filters.type && filters.discount) {
    return typeDiscountIndexKey(filters.type, filters.discount, prefix);
  }
  if (filters.type) return typeIndexKey(filters.type, prefix);
  if (filters.discount) return discountIndexKey(filters.discount, prefix);
  return allIndexKey(prefix);
}

function normalizePageSize(limit?: number) {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(limit)));
}

function toScoredPostIds(rawEntries: (string | number)[]) {
  const entries: ScoredPostId[] = [];

  for (let index = 0; index < rawEntries.length; index += 2) {
    const id = rawEntries[index];
    const score = Number(rawEntries[index + 1]);
    if (typeof id === "string" && Number.isFinite(score)) {
      entries.push({ id, score });
    }
  }

  return entries;
}

function isAfterCursor(entry: ScoredPostId, cursor: Cursor | null) {
  if (!cursor) return true;
  return entry.score < cursor.score ||
    (entry.score === cursor.score && entry.id < cursor.id);
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.score === "number" &&
      Number.isFinite(parsed.score) &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { score: parsed.score, id: parsed.id };
    }
  } catch {
    // Invalid cursors are rejected by the API schema before reaching the repository.
  }

  throw new Error("Invalid post cursor");
}

function toHallPostDto(post: StoredPost): HallPostDto {
  return {
    id: post.id,
    type: post.type,
    publisherId: toPublicDeviceId(post.publisherDeviceHash),
    discount: post.discount,
    pieceNumber: post.pieceNumber,
    availablePayloadKinds: post.availablePayloadKinds,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
  };
}

async function cleanupOrphans(
  redis: Pick<PostRedis, "zrem">,
  orphanIds: string[],
  prefix?: string,
) {
  const indexKeys = [
    allIndexKey(prefix),
    ...(["GIVE", "REQUEST"] as const).map((type) => typeIndexKey(type, prefix)),
    ...([95, 90, 80] as const).map((discount) =>
      discountIndexKey(discount, prefix),
    ),
    ...(["GIVE", "REQUEST"] as const).flatMap((type) =>
      ([95, 90, 80] as const).map((discount) =>
        typeDiscountIndexKey(type, discount, prefix),
      ),
    ),
  ];

  for (let offset = 0; offset < orphanIds.length; offset += ORPHAN_CLEANUP_BATCH_SIZE) {
    const batch = orphanIds.slice(offset, offset + ORPHAN_CLEANUP_BATCH_SIZE);
    await Promise.all(indexKeys.map((key) => redis.zrem(key, ...batch)));
  }
}

function parseClaimResult(value: unknown): ClaimPostResult {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Invalid claim script result");
    }
  }

  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    throw new Error("Invalid claim script result");
  }

  switch (parsed.status) {
    case "CLAIMED":
      if (
        !isPayloads(parsed.payloads) ||
        typeof parsed.idempotent !== "boolean"
      ) {
        throw new Error("Invalid claim script result");
      }
      return {
        status: "CLAIMED",
        payloads: parsed.payloads,
        idempotent: parsed.idempotent,
      };
    case "SELF_CLAIM_FORBIDDEN":
      return { status: "SELF_CLAIM_FORBIDDEN" };
    case "ALREADY_CLAIMED":
      return { status: "ALREADY_CLAIMED" };
    case "EXPIRED":
      return { status: "EXPIRED" };
    default:
      throw new Error("Invalid claim script result");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPayloads(value: unknown): value is StoredPost["payloads"] {
  if (!isRecord(value)) return false;
  const command = value.command;
  const url = value.url;
  return (
    (typeof command === "string" || typeof url === "string") &&
    (command === undefined || typeof command === "string") &&
    (url === undefined || typeof url === "string")
  );
}

type LegacyStoredPost = Omit<StoredPost, "availablePayloadKinds" | "payloads" | "payloadHashes"> & {
  payloadKind: "COMMAND" | "URL";
  payload: string;
  payloadHash: string;
};

function normalizeStoredPost(value: StoredPost | LegacyStoredPost | null): StoredPost | null {
  if (!value) return null;
  if ("payloads" in value) return value;

  const command = value.payloadKind === "COMMAND" ? value.payload : undefined;
  const url = value.payloadKind === "URL" ? value.payload : undefined;
  const commandHash = value.payloadKind === "COMMAND" ? value.payloadHash : undefined;
  const urlHash = value.payloadKind === "URL" ? value.payloadHash : undefined;

  return {
    id: value.id,
    type: value.type,
    discount: value.discount,
    pieceNumber: value.pieceNumber,
    availablePayloadKinds: [value.payloadKind],
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    publisherDeviceHash: value.publisherDeviceHash,
    payloads: { ...(command ? { command } : {}), ...(url ? { url } : {}) },
    payloadHashes: {
      ...(commandHash ? { command: commandHash } : {}),
      ...(urlHash ? { url: urlHash } : {}),
    },
  };
}
