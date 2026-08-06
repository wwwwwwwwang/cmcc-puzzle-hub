import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Discount,
  HallPostDto,
  PayloadKind,
  PostSources,
  PostType,
} from "../domain/types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;

type AdminClient = SupabaseClient;

type RepositoryOptions = {
  client?: AdminClient;
};

export type PublishPostArgs = {
  publisherId: string;
  type: PostType;
  discount: Discount;
  pieceNumber: number;
  payloads: PostSources;
  availablePayloadKinds: PayloadKind[];
  payloadHashes: string[];
  expiresAt: string;
};

export type PublishPostResult =
  | { status: "CREATED"; post: HallPostDto }
  | { status: "DUPLICATE_POST" }
  | { status: "INSUFFICIENT_CREDITS" };

export type ClaimPostResult =
  | { status: "CLAIMED"; payloads: PostSources; idempotent: boolean }
  | { status: "SELF_CLAIM_FORBIDDEN" }
  | { status: "ALREADY_CLAIMED" }
  | { status: "EXPIRED" }
  | { status: "INSUFFICIENT_CREDITS" }
  | { status: "INVALID_POST_TYPE" };

export type HelpRequestPostResult =
  | {
      status: "HELPED";
      payloads: PostSources;
      idempotent: boolean;
      confirmationDeadline: string;
    }
  | { status: "SELF_HELP_FORBIDDEN" }
  | { status: "ALREADY_HELPED" }
  | { status: "HELP_RETRY_FORBIDDEN" }
  | { status: "EXPIRED" }
  | { status: "INVALID_POST_TYPE" };

export type ResolveRequestHelpResult =
  | { status: "COMPLETED"; confirmationMethod: "MANUAL" | "AUTO" }
  | { status: "REOPENED" }
  | { status: "EXPIRED" }
  | { status: "FORBIDDEN" }
  | { status: "NOT_PENDING" };

export type MaintenanceResult = {
  autoConfirmed: number;
  requestRefunded: number;
  giveExpired: number;
};

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

function getClient(options: RepositoryOptions): AdminClient {
  return options.client ?? createSupabaseAdminClient();
}

export async function publishPost(
  args: PublishPostArgs,
  options: RepositoryOptions = {},
): Promise<PublishPostResult> {
  const client = getClient(options);
  const { data, error } = await client.rpc("publish_post", {
    p_publisher: args.publisherId,
    p_type: args.type,
    p_discount: args.discount,
    p_piece_number: args.pieceNumber,
    p_payloads: args.payloads,
    p_kinds: args.availablePayloadKinds,
    p_hashes: args.payloadHashes,
    p_expires_at: args.expiresAt,
  });

  if (error) throw new Error(`publish_post 调用失败: ${error.message}`);

  const result = data as { status: string; post?: RawRpcPost };
  if (result.status === "DUPLICATE_POST") return { status: "DUPLICATE_POST" };
  if (result.status === "INSUFFICIENT_CREDITS") {
    return { status: "INSUFFICIENT_CREDITS" };
  }
  if (result.status !== "CREATED" || !result.post) {
    throw new Error("publish_post 返回异常");
  }

  return { status: "CREATED", post: toHallPostDto(result.post) };
}

export async function claimPost(
  postId: string,
  claimantId: string,
  allowEarn: boolean,
  options: RepositoryOptions = {},
): Promise<ClaimPostResult> {
  const client = getClient(options);
  const { data, error } = await client.rpc("claim_post", {
    p_post_id: postId,
    p_claimant: claimantId,
    p_allow_earn: allowEarn,
  });

  if (error) throw new Error(`claim_post 调用失败: ${error.message}`);

  const result = data as {
    status: ClaimPostResult["status"];
    idempotent?: boolean;
    payloads?: PostSources;
  };

  if (result.status === "CLAIMED") {
    return {
      status: "CLAIMED",
      payloads: result.payloads ?? {},
      idempotent: Boolean(result.idempotent),
    };
  }
  return { status: result.status };
}

export async function helpRequestPost(
  postId: string,
  helperId: string,
  options: RepositoryOptions = {},
): Promise<HelpRequestPostResult> {
  const client = getClient(options);
  const { data, error } = await client.rpc("help_request_post", {
    p_post_id: postId,
    p_helper: helperId,
  });
  if (error) throw new Error(`help_request_post 调用失败: ${error.message}`);

  const result = data as {
    status: string;
    payloads?: PostSources;
    idempotent?: boolean;
    confirmationDeadline?: string;
  };
  if (result.status === "HELPED") {
    if (!result.payloads || !result.confirmationDeadline) {
      throw new Error("help_request_post 返回异常");
    }
    return {
      status: "HELPED",
      payloads: result.payloads,
      idempotent: Boolean(result.idempotent),
      confirmationDeadline: result.confirmationDeadline,
    };
  }
  if (isHelpFailureStatus(result.status)) return { status: result.status };
  throw new Error("help_request_post 返回异常");
}

export async function resolveRequestHelp(
  postId: string,
  publisherId: string,
  received: boolean,
  options: RepositoryOptions = {},
): Promise<ResolveRequestHelpResult> {
  const client = getClient(options);
  const { data, error } = await client.rpc("resolve_request_help", {
    p_post_id: postId,
    p_publisher: publisherId,
    p_received: received,
  });
  if (error) throw new Error(`resolve_request_help 调用失败: ${error.message}`);

  const result = data as { status: string; confirmationMethod?: "MANUAL" | "AUTO" };
  if (result.status === "COMPLETED" && result.confirmationMethod) {
    return { status: "COMPLETED", confirmationMethod: result.confirmationMethod };
  }
  if (isResolveStatus(result.status)) return { status: result.status };
  throw new Error("resolve_request_help 返回异常");
}

export async function syncRequestMaintenance(
  options: RepositoryOptions = {},
): Promise<MaintenanceResult> {
  const client = getClient(options);
  const { data, error } = await client.rpc("sync_request_maintenance");
  if (error) throw new Error(`sync_request_maintenance 调用失败: ${error.message}`);
  const result = data as Partial<MaintenanceResult>;
  if (
    typeof result.autoConfirmed !== "number" ||
    typeof result.requestRefunded !== "number" ||
    typeof result.giveExpired !== "number"
  ) {
    throw new Error("sync_request_maintenance 返回异常");
  }
  return result as MaintenanceResult;
}

function isHelpFailureStatus(status: string): status is Exclude<
  HelpRequestPostResult["status"],
  "HELPED"
> {
  return [
    "SELF_HELP_FORBIDDEN",
    "ALREADY_HELPED",
    "HELP_RETRY_FORBIDDEN",
    "EXPIRED",
    "INVALID_POST_TYPE",
  ].includes(status);
}

function isResolveStatus(status: string): status is Exclude<
  ResolveRequestHelpResult["status"],
  "COMPLETED"
> {
  return ["REOPENED", "EXPIRED", "FORBIDDEN", "NOT_PENDING"].includes(status);
}

export async function delistPost(
  postId: string,
  ownerId: string,
  options: RepositoryOptions = {},
): Promise<{ status: "DELISTED" | "NOT_FOUND_OR_NOT_OPEN" }> {
  const client = getClient(options);
  const { data, error } = await client.rpc("delist_post", {
    p_post_id: postId,
    p_owner: ownerId,
  });
  if (error) throw new Error(`delist_post 调用失败: ${error.message}`);
  return data as { status: "DELISTED" | "NOT_FOUND_OR_NOT_OPEN" };
}

export async function listPosts(
  filters: ListPostFilters = {},
  options: RepositoryOptions = {},
): Promise<HallPostPage> {
  const client = getClient(options);
  const pageSize = normalizePageSize(filters.limit);
  const cursor = decodeCursor(filters.cursor);

  // 多取一条判断是否有下一页。
  const { data, error } = await client.rpc("list_hall_posts", {
    p_type: filters.type ?? null,
    p_discount: filters.discount ?? null,
    p_piece_number: filters.pieceNumber ?? null,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: pageSize + 1,
  });

  if (error) throw new Error(`list_hall_posts 调用失败: ${error.message}`);

  const rows = (data ?? []) as RawHallRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const items = pageRows.map(toHallPostDtoFromView);
  const last = pageRows.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null,
  };
}

type RawRpcPost = {
  id: string;
  publisherId: string;
  type: PostType;
  discount: Discount;
  pieceNumber: number;
  availablePayloadKinds: PayloadKind[];
  createdAt: string;
  expiresAt: string;
};

type RawHallRow = {
  id: string;
  publisher_public_id: string;
  type: PostType;
  discount: Discount;
  piece_number: number;
  available_payload_kinds: PayloadKind[];
  created_at: string;
  expires_at: string;
};

function toHallPostDto(post: RawRpcPost): HallPostDto {
  return {
    id: post.id,
    type: post.type,
    publisherId: post.publisherId,
    discount: post.discount,
    pieceNumber: post.pieceNumber,
    availablePayloadKinds: post.availablePayloadKinds,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
  };
}

function toHallPostDtoFromView(row: RawHallRow): HallPostDto {
  return {
    id: row.id,
    type: row.type,
    publisherId: row.publisher_public_id,
    discount: row.discount,
    pieceNumber: row.piece_number,
    availablePayloadKinds: row.available_payload_kinds,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

type Cursor = { createdAt: string; id: string };

function normalizePageSize(limit?: number) {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(limit)));
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
      typeof parsed.createdAt === "string" &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // 非法游标由 API 层 schema 拦截。
  }
  throw new Error("Invalid post cursor");
}
