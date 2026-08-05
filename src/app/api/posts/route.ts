import { createHash, randomUUID } from "node:crypto";

import { DomainError } from "@/features/posts/domain/errors";
import {
  assertPostTypeMatches,
  parseSources,
} from "@/features/posts/domain/parse-source";
import {
  createPostInputSchema,
  type CreatePostInput,
} from "@/features/posts/domain/schemas";
import {
  listPosts,
  publishPost,
} from "@/features/posts/server/post-repository";
import { checkPublishRateLimit } from "@/features/posts/server/rate-limit";
import { getApprovedUser } from "@/lib/supabase/server";

const POST_TTL_MS = 86_400_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseListQuery(url.searchParams);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400, parsed.field);

  try {
    const page = await listPosts(parsed.filters);
    return Response.json(page);
  } catch (error) {
    logRouteError("SERVICE_UNAVAILABLE", error);
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  const user = await getApprovedUser();
  if (!user) return jsonError("UNAUTHENTICATED", 401);

  let input: CreatePostInput;
  try {
    input = createPostInputSchema.parse(await request.json());
  } catch {
    return jsonError("INVALID_INPUT", 400);
  }

  try {
    const rate = await checkPublishRateLimit(user.id);
    if (!rate.success) {
      const retryAfter = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
      return jsonError("RATE_LIMITED", 429, undefined, {
        "Retry-After": String(retryAfter),
      });
    }

    const parsedSources = parseSources(input.sources, input.selection);
    assertPostTypeMatches(parsedSources.type, input.type);
    const payloadHashes = [
      ...(parsedSources.sources.command
        ? [sha256(parsedSources.sources.command)]
        : []),
      ...(parsedSources.sources.url ? [sha256(parsedSources.sources.url)] : []),
    ];
    const expiresAt = new Date(Date.now() + POST_TTL_MS);
    const result = await publishPost({
      publisherId: user.id,
      type: parsedSources.type,
      discount: input.selection.discount,
      pieceNumber: input.selection.pieceNumber,
      availablePayloadKinds: [
        ...(parsedSources.sources.command ? (["COMMAND"] as const) : []),
        ...(parsedSources.sources.url ? (["URL"] as const) : []),
      ],
      payloads: parsedSources.sources,
      payloadHashes,
      expiresAt: expiresAt.toISOString(),
    });

    if (result.status === "DUPLICATE_POST") {
      return jsonError("DUPLICATE_POST", 409);
    }

    return Response.json(
      { post: result.post },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return jsonError(error.code, 400);
    }
    logRouteError("SERVICE_UNAVAILABLE", error);
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseListQuery(searchParams: URLSearchParams) {
  const allowedKeys = new Set([
    "type",
    "discount",
    "pieceNumber",
    "cursor",
    "limit",
  ]);
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key) || searchParams.getAll(key).length !== 1) {
      return { success: false as const, field: key };
    }
  }

  const type = searchParams.get("type") || undefined;
  const discountValue = searchParams.get("discount");
  const pieceNumberValue = searchParams.get("pieceNumber");
  const limitValue = searchParams.get("limit");
  const cursor = searchParams.get("cursor") || undefined;
  const discount = discountValue ? Number(discountValue) : undefined;
  const pieceNumber = pieceNumberValue ? Number(pieceNumberValue) : undefined;
  const limit = limitValue ? Number(limitValue) : undefined;

  if (type !== undefined && type !== "GIVE" && type !== "REQUEST") {
    return { success: false as const, field: "type" };
  }
  if (discount !== undefined && ![95, 90, 80].includes(discount)) {
    return { success: false as const, field: "discount" };
  }
  if (
    pieceNumberValue !== null &&
    !/^[1-9]\d*$/.test(pieceNumberValue)
  ) {
    return { success: false as const, field: "pieceNumber" };
  }
  const maxPieceNumber =
    discount === 95 ? 4 : discount === 90 ? 6 : discount === 80 ? 9 : 9;
  if (pieceNumber !== undefined && pieceNumber > maxPieceNumber) {
    return { success: false as const, field: "pieceNumber" };
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
  if (cursor !== undefined && !isValidCursor(cursor)) {
    return { success: false as const, field: "cursor" };
  }

  return {
    success: true as const,
    filters: {
      ...(type ? { type: type as "GIVE" | "REQUEST" } : {}),
      ...(discount ? { discount: discount as 95 | 90 | 80 } : {}),
      ...(pieceNumber ? { pieceNumber } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit ? { limit } : {}),
    },
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.createdAt === "string" &&
      Number.isFinite(Date.parse(parsed.createdAt)) &&
      typeof parsed.id === "string" &&
      UUID_PATTERN.test(parsed.id)
    );
  } catch {
    return false;
  }
}

function logRouteError(code: string, error?: unknown) {
  // 真实错误只进服务端日志(便于定位),不进响应体。
  const detail = error instanceof Error ? error.message : String(error ?? "");
  console.error(JSON.stringify({ code, requestId: randomUUID(), detail }));
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
