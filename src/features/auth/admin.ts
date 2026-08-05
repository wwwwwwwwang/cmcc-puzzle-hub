import "server-only";

import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PendingUser = {
  id: string;
  username: string | null;
  publicId: string;
  registrationIp: string | null;
  sameIpCount: number;
  createdAt: string;
};

/**
 * 当前会话是否为管理员。
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return Boolean(data?.is_admin);
}

/**
 * 列出待审核用户(经 RPC,函数内校验管理员)。
 */
export async function listPendingUsers(): Promise<PendingUser[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("list_pending_users", {
    p_admin: user.id,
  });
  if (error) throw new Error(`list_pending_users 调用失败: ${error.message}`);

  return ((data ?? []) as {
    id: string;
    username: string | null;
    public_id: string;
    registration_ip: string | null;
    same_ip_count: number;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    username: row.username,
    publicId: row.public_id,
    registrationIp: row.registration_ip,
    sameIpCount: Number(row.same_ip_count),
    createdAt: row.created_at,
  }));
}
