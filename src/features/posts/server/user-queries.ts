import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ConfirmationMethod,
  Discount,
  HelpAttemptStatus,
  PayloadKind,
  PostSources,
  PostType,
  RequestPostStatus,
} from "../domain/types";

type RequestCreditStatus = "HELD" | "SETTLED" | "REFUNDED";
type ClosureReason = "DELISTED" | "TIMEOUT";
export const ACCOUNT_PAGE_SIZE = 20;

export type AccountPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type MyPost = {
  id: string;
  type: PostType;
  discount: Discount;
  pieceNumber: number;
  availablePayloadKinds: PayloadKind[];
  status: RequestPostStatus | "CLAIMED";
  requestCreditStatus: RequestCreditStatus | null;
  closureReason: ClosureReason | null;
  confirmationDeadline: string | null;
  confirmationMethod: ConfirmationMethod | null;
  createdAt: string;
  expiresAt: string;
};

export type ClaimedPost = MyPost & { payloads: PostSources };

export type MyHelpedPost = {
  attemptId: string;
  postId: string;
  discount: Discount;
  pieceNumber: number;
  payloads: PostSources;
  status: HelpAttemptStatus;
  confirmationDeadline: string;
  confirmationMethod: ConfirmationMethod | null;
  helpedAt: string;
  resolvedAt: string | null;
};

export type CreditLedgerEntry = {
  id: number;
  delta: number;
  reason: string;
  createdAt: string;
};

export type CreditOverview = {
  credits: number;
  publicId: string;
  ledger: CreditLedgerEntry[];
};

export type AccountActivity = {
  pendingConfirmationCount: number;
  pendingHelpCount: number;
  version: string;
};

type PostRow = {
  id: string;
  type: PostType;
  discount: Discount;
  piece_number: number;
  available_payload_kinds: PayloadKind[];
  status: MyPost["status"];
  request_credit_status?: RequestCreditStatus | null;
  closure_reason?: ClosureReason | null;
  created_at: string;
  expires_at: string;
  claimed_at?: string | null;
  payloads?: PostSources;
  request_help_attempts?: {
    status: HelpAttemptStatus;
    confirmation_deadline: string;
    confirmation_method: ConfirmationMethod | null;
  }[];
};

type AccountCursor = {
  timestamp: string;
  id: string;
};

function encodeAccountCursor(timestamp: string, id: string) {
  return Buffer.from(JSON.stringify({ timestamp, id })).toString("base64url");
}

function decodeAccountCursor(value?: string): AccountCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<AccountCursor>;
    if (
      typeof parsed.timestamp !== "string" ||
      !Number.isFinite(Date.parse(parsed.timestamp)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      return null;
    }
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    return null;
  }
}

function accountCursorFilter(column: string, cursor: AccountCursor) {
  return `${column}.lt.${cursor.timestamp},and(${column}.eq.${cursor.timestamp},id.lt.${cursor.id})`;
}

function toMyPost(row: PostRow): MyPost {
  const resolvedAttempt = row.request_help_attempts?.find(
    (attempt) => attempt.status === "PENDING" || attempt.status === "COMPLETED",
  );
  return {
    id: row.id,
    type: row.type,
    discount: row.discount,
    pieceNumber: row.piece_number,
    availablePayloadKinds: row.available_payload_kinds,
    status: row.status,
    requestCreditStatus: row.request_credit_status ?? null,
    closureReason: row.closure_reason ?? null,
    confirmationDeadline: resolvedAttempt?.confirmation_deadline ?? null,
    confirmationMethod: resolvedAttempt?.confirmation_method ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const POST_COLUMNS =
  "id, type, discount, piece_number, available_payload_kinds, status, request_credit_status, closure_reason, created_at, expires_at";

export async function getMyPosts(
  cursorValue?: string,
): Promise<AccountPage<MyPost>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], nextCursor: null };

  const cursor = decodeAccountCursor(cursorValue);
  let query = supabase
    .from("posts")
    .select(
      `${POST_COLUMNS}, request_help_attempts(status, confirmation_deadline, confirmation_method)`,
    )
    .eq("publisher_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACCOUNT_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(accountCursorFilter("created_at", cursor));
  }

  const { data, error } = await query;

  if (error) throw new Error(`查询我的帖子失败: ${error.message}`);
  const allRows = (data ?? []) as PostRow[];
  const rows = allRows.slice(0, ACCOUNT_PAGE_SIZE);
  const last = rows.at(-1);
  return {
    items: rows.map(toMyPost),
    nextCursor:
      allRows.length > ACCOUNT_PAGE_SIZE && last
        ? encodeAccountCursor(last.created_at, last.id)
        : null,
  };
}

export async function getMyClaimedPosts(
  cursorValue?: string,
): Promise<AccountPage<ClaimedPost>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], nextCursor: null };

  const cursor = decodeAccountCursor(cursorValue);
  let query = supabase
    .from("posts")
    .select(`${POST_COLUMNS}, claimed_at, payloads`)
    .eq("claimant_id", user.id)
    .eq("type", "GIVE")
    .order("claimed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACCOUNT_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(accountCursorFilter("claimed_at", cursor));
  }

  const { data, error } = await query;

  if (error) throw new Error(`查询已领取帖子失败: ${error.message}`);
  const allRows = (data ?? []) as PostRow[];
  const rows = allRows.slice(0, ACCOUNT_PAGE_SIZE);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => ({
      ...toMyPost(row),
      payloads: row.payloads ?? {},
    })),
    nextCursor:
      allRows.length > ACCOUNT_PAGE_SIZE && last?.claimed_at
        ? encodeAccountCursor(last.claimed_at, last.id)
        : null,
  };
}

type HelpAttemptRow = {
  id: string;
  post_id: string;
  status: HelpAttemptStatus;
  helped_at: string;
  confirmation_deadline: string;
  confirmation_method: ConfirmationMethod | null;
  resolved_at: string | null;
  posts:
    | {
        discount: Discount;
        piece_number: number;
        payloads: PostSources;
      }
    | {
        discount: Discount;
        piece_number: number;
        payloads: PostSources;
      }[];
};

export async function getMyHelpedPosts(
  cursorValue?: string,
): Promise<AccountPage<MyHelpedPost>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], nextCursor: null };

  const cursor = decodeAccountCursor(cursorValue);
  let query = supabase
    .from("request_help_attempts")
    .select(
      "id, post_id, status, helped_at, confirmation_deadline, confirmation_method, resolved_at, posts!request_help_attempts_post_id_fkey(discount, piece_number, payloads)",
    )
    .eq("helper_id", user.id)
    .order("helped_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACCOUNT_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(accountCursorFilter("helped_at", cursor));
  }

  const { data, error } = await query;

  if (error) throw new Error(`查询我帮助的帖子失败: ${error.message}`);

  const allRows = (data ?? []) as HelpAttemptRow[];
  const rows = allRows.slice(0, ACCOUNT_PAGE_SIZE);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => {
      const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
      return {
        attemptId: row.id,
        postId: row.post_id,
        discount: post.discount,
        pieceNumber: post.piece_number,
        payloads: post.payloads ?? {},
        status: row.status,
        confirmationDeadline: row.confirmation_deadline,
        confirmationMethod: row.confirmation_method,
        helpedAt: row.helped_at,
        resolvedAt: row.resolved_at,
      };
    }),
    nextCursor:
      allRows.length > ACCOUNT_PAGE_SIZE && last
        ? encodeAccountCursor(last.helped_at, last.id)
        : null,
  };
}

export async function getAccountActivity(): Promise<AccountActivity | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_account_activity");
  if (error) throw new Error(`查询账户活动失败: ${error.message}`);

  const activity = data as
    | {
        pendingConfirmationCount?: unknown;
        pendingHelpCount?: unknown;
        version?: unknown;
      }
    | null;

  if (
    !activity ||
    typeof activity.pendingConfirmationCount !== "number" ||
    typeof activity.pendingHelpCount !== "number" ||
    typeof activity.version !== "string"
  ) {
    throw new Error("get_account_activity 返回异常");
  }

  return {
    pendingConfirmationCount: activity.pendingConfirmationCount,
    pendingHelpCount: activity.pendingHelpCount,
    version: activity.version,
  };
}

export async function getCreditOverview(): Promise<CreditOverview | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: ledger }] = await Promise.all([
    supabase.from("profiles").select("credits, public_id").eq("id", user.id).single(),
    supabase
      .from("credit_ledger")
      .select("id, delta, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (!profile) return null;

  return {
    credits: profile.credits as number,
    publicId: profile.public_id as string,
    ledger: ((ledger ?? []) as {
      id: number;
      delta: number;
      reason: string;
      created_at: string;
    }[]).map((entry) => ({
      id: entry.id,
      delta: entry.delta,
      reason: entry.reason,
      createdAt: entry.created_at,
    })),
  };
}
