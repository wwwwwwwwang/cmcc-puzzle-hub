import "server-only";

import type {
  Discount,
  HallPostDto,
  PostType,
  StoredPost,
} from "../domain/types";
import {
  allIndexKey,
  createPostId,
  dedupeKey,
  discountIndexKey,
  postKey,
  typeDiscountIndexKey,
  typeIndexKey,
} from "./keys";
import { getRedis } from "./redis";

const POST_TTL_SECONDS = 86_400;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;
const READ_BATCH_SIZE = 40;

export const PUBLISH_POST_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return "DUPLICATE"
end

if not redis.call("SET", KEYS[2], "1", "EX", ARGV[2], "NX") then
  return "DUPLICATE"
end

redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("ZADD", KEYS[3], ARGV[3], ARGV[4])
redis.call("ZADD", KEYS[4], ARGV[3], ARGV[4])
redis.call("ZADD", KEYS[5], ARGV[3], ARGV[4])
redis.call("ZADD", KEYS[6], ARGV[3], ARGV[4])

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
};

type RepositoryOptions = {
  redis?: PostRedis;
  prefix?: string;
  randomUUID?: () => string;
};

type PublishPostResult =
  | { status: "CREATED"; post: StoredPost }
  | { status: "DUPLICATE_POST" };

export type ListPostFilters = {
  type?: PostType;
  discount?: Discount;
  cursor?: string;
  limit?: number;
};

export type HallPostPage = {
  items: HallPostDto[];
  nextCursor: string | null;
};

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
      dedupeKey(storedPost.payloadHash, options.prefix),
      allIndexKey(options.prefix),
      typeIndexKey(storedPost.type, options.prefix),
      discountIndexKey(storedPost.discount, options.prefix),
      typeDiscountIndexKey(storedPost.type, storedPost.discount, options.prefix),
    ],
    [
      JSON.stringify(storedPost),
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
  let offset = 0;
  let exhausted = false;

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
    const orphanIds: string[] = [];

    entries.forEach((entry, index) => {
      const storedPost = values[index];
      if (!storedPost) {
        orphanIds.push(entry.id);
        return;
      }
      posts.set(entry.id, storedPost);
      collected.push(entry);
    });

    if (orphanIds.length > 0) {
      await cleanupOrphans(redis, orphanIds, options.prefix);
    }
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
    discount: post.discount,
    pieceNumber: post.pieceNumber,
    payloadKind: post.payloadKind,
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

  await Promise.all(
    indexKeys.flatMap((key) => orphanIds.map((id) => redis.zrem(key, id))),
  );
}
