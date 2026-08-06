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
  payloads?: PostSources;
  request_help_attempts?: {
    status: HelpAttemptStatus;
    confirmation_deadline: string;
    confirmation_method: ConfirmationMethod | null;
  }[];
};

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

export async function getMyPosts(): Promise<MyPost[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("posts")
    .select(
      `${POST_COLUMNS}, request_help_attempts(status, confirmation_deadline, confirmation_method)`,
    )
    .eq("publisher_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`查询我的帖子失败: ${error.message}`);
  return ((data ?? []) as PostRow[]).map(toMyPost);
}

export async function getMyClaimedPosts(): Promise<ClaimedPost[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("posts")
    .select(`${POST_COLUMNS}, payloads`)
    .eq("claimant_id", user.id)
    .eq("type", "GIVE")
    .order("claimed_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`查询已领取帖子失败: ${error.message}`);
  return ((data ?? []) as PostRow[]).map((row) => ({
    ...toMyPost(row),
    payloads: row.payloads ?? {},
  }));
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

export async function getMyHelpedPosts(): Promise<MyHelpedPost[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("request_help_attempts")
    .select(
      "id, post_id, status, helped_at, confirmation_deadline, confirmation_method, resolved_at, posts!request_help_attempts_post_id_fkey(discount, piece_number, payloads)",
    )
    .eq("helper_id", user.id)
    .order("helped_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`查询我帮助的帖子失败: ${error.message}`);

  return ((data ?? []) as HelpAttemptRow[]).map((row) => {
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
  });
}

export async function getAccountActivity(): Promise<AccountActivity | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [confirmationResult, helpResult, postVersionResult, helpVersionResult] =
    await Promise.all([
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("publisher_id", user.id)
        .eq("status", "PENDING_CONFIRM"),
      supabase
        .from("request_help_attempts")
        .select("id", { count: "exact", head: true })
        .eq("helper_id", user.id)
        .eq("status", "PENDING"),
      supabase
        .from("posts")
        .select("updated_at")
        .eq("publisher_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase
        .from("request_help_attempts")
        .select("helped_at, resolved_at")
        .eq("helper_id", user.id)
        .order("resolved_at", { ascending: false, nullsFirst: false })
        .limit(1),
    ]);

  const error =
    confirmationResult.error ??
    helpResult.error ??
    postVersionResult.error ??
    helpVersionResult.error;
  if (error) throw new Error(`查询账户活动失败: ${error.message}`);

  const postVersion = (postVersionResult.data?.[0] as
    | { updated_at?: string }
    | undefined)?.updated_at;
  const helpVersionRow = helpVersionResult.data?.[0] as
    | { helped_at?: string; resolved_at?: string | null }
    | undefined;

  return {
    pendingConfirmationCount: confirmationResult.count ?? 0,
    pendingHelpCount: helpResult.count ?? 0,
    version: latestVersion([
      postVersion,
      helpVersionRow?.helped_at,
      helpVersionRow?.resolved_at,
    ]),
  };
}

function latestVersion(values: (string | null | undefined)[]) {
  return values.reduce<string>((latest, value) => {
    if (!value) return latest;
    return !latest || Date.parse(value) > Date.parse(latest) ? value : latest;
  }, "0");
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
