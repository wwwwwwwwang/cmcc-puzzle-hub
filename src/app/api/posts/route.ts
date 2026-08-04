import { createHash } from "node:crypto";

import { hashVisitorId } from "@/features/posts/device/hash";
import { DomainError } from "@/features/posts/domain/errors";
import { parseSource } from "@/features/posts/domain/parse-source";
import {
  createPostInputSchema,
  type CreatePostInput,
} from "@/features/posts/domain/schemas";
import type { HallPostDto, StoredPost } from "@/features/posts/domain/types";
import {
  listPosts,
  publishPost,
} from "@/features/posts/server/post-repository";
import { checkPublishRateLimit } from "@/features/posts/server/rate-limit";

const POST_TTL_MS = 86_400_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseListQuery(url.searchParams);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400, parsed.field);

  try {
    const page = await listPosts(parsed.filters);
    return Response.json(page);
  } catch {
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  let input: CreatePostInput;
  try {
    input = createPostInputSchema.parse(await request.json());
  } catch {
    return jsonError("INVALID_INPUT", 400);
  }

  try {
    const deviceHash = hashVisitorId(input.visitorId);
    const rate = await checkPublishRateLimit(deviceHash);
    if (!rate.success) {
      const retryAfter = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
      return jsonError("RATE_LIMITED", 429, undefined, {
        "Retry-After": String(retryAfter),
      });
    }

    const parsedSource = parseSource(input.source, input.selection);
    const payload = parsedSource.payload.trim();
    const payloadHash = createHash("sha256").update(payload).digest("hex");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + POST_TTL_MS);
    const result = await publishPost({
      type: parsedSource.type,
      discount: input.selection.discount,
      pieceNumber: input.selection.pieceNumber,
      payloadKind: parsedSource.payloadKind,
      payload,
      publisherDeviceHash: deviceHash,
      payloadHash,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    if (result.status === "DUPLICATE_POST") {
      return jsonError("DUPLICATE_POST", 409);
    }

    return Response.json({ post: toHallPostDto(result.post) }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) {
      return jsonError(error.code, 400);
    }
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

function parseListQuery(searchParams: URLSearchParams) {
  const allowedKeys = new Set(["type", "discount", "cursor", "limit"]);
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key) || searchParams.getAll(key).length !== 1) {
      return { success: false as const, field: key };
    }
  }

  const type = searchParams.get("type") || undefined;
  const discountValue = searchParams.get("discount");
  const limitValue = searchParams.get("limit");
  const cursor = searchParams.get("cursor") || undefined;
  const discount = discountValue ? Number(discountValue) : undefined;
  const limit = limitValue ? Number(limitValue) : undefined;

  if (type !== undefined && type !== "GIVE" && type !== "REQUEST") {
    return { success: false as const, field: "type" };
  }
  if (discount !== undefined && ![95, 90, 80].includes(discount)) {
    return { success: false as const, field: "discount" };
  }
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 20)
  ) {
    return { success: false as const, field: "limit" };
  }
  if (cursor !== undefined && !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    return { success: false as const, field: "cursor" };
  }

  return {
    success: true as const,
    filters: {
      ...(type ? { type: type as "GIVE" | "REQUEST" } : {}),
      ...(discount ? { discount: discount as 95 | 90 | 80 } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit ? { limit } : {}),
    },
  };
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

function jsonError(
  code: string,
  status: number,
  field?: string,
  headers?: Record<string, string>,
) {
  return Response.json(
    {
      error: {
        code,
        message: code,
        ...(field ? { field } : {}),
      },
    },
    { status, headers },
  );
}
