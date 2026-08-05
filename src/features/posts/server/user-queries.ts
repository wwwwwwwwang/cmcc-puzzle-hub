import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Discount, PayloadKind, PostSources, PostType } from "../domain/types";

export type MyPost = {
  id: string;
  type: PostType;
  discount: Discount;
  pieceNumber: number;
  availablePayloadKinds: PayloadKind[];
  status: "OPEN" | "CLAIMED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
};

export type ClaimedPost = MyPost & { payloads: PostSources };

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

type PostRow = {
  id: string;
  type: PostType;
  discount: Discount;
  piece_number: number;
  available_payload_kinds: PayloadKind[];
  status: MyPost["status"];
  created_at: string;
  expires_at: string;
  payloads?: PostSources;
};

function toMyPost(row: PostRow): MyPost {
  return {
    id: row.id,
    type: row.type,
    discount: row.discount,
    pieceNumber: row.piece_number,
    availablePayloadKinds: row.available_payload_kinds,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const POST_COLUMNS =
  "id, type, discount, piece_number, available_payload_kinds, status, created_at, expires_at";

export async function getMyPosts(): Promise<MyPost[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
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
    .order("claimed_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`查询已领取帖子失败: ${error.message}`);
  return ((data ?? []) as PostRow[]).map((row) => ({
    ...toMyPost(row),
    payloads: row.payloads ?? {},
  }));
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
