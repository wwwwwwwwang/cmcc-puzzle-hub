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

export const USER_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "BANNED",
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
export type UserStatusFilter = UserStatus | null;

export type ManagedUser = PendingUser & {
  credits: number;
  status: UserStatus;
  isAdmin: boolean;
};

export const USER_PAGE_SIZE = 20;

export type ManagedUserPage = {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
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

function isUserStatus(value: string | null | undefined): value is UserStatus {
  return Boolean(value && USER_STATUSES.includes(value as UserStatus));
}

export async function listUsers(
  status: UserStatusFilter = null,
  search = "",
  registrationIp = "",
  page = 1,
  pageSize = USER_PAGE_SIZE,
): Promise<ManagedUserPage> {
  const user = await getCurrentUser();
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const normalizedPageSize = Number.isFinite(pageSize)
    ? Math.min(50, Math.max(1, Math.floor(pageSize)))
    : USER_PAGE_SIZE;
  if (!user) {
    return { users: [], total: 0, page: normalizedPage, pageSize: normalizedPageSize };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("list_users", {
    p_admin: user.id,
    p_status: isUserStatus(status) ? status : null,
    p_search: search.trim(),
    p_registration_ip: registrationIp.trim(),
    p_limit: normalizedPageSize,
    p_offset: (normalizedPage - 1) * normalizedPageSize,
  });
  if (error) throw new Error(`list_users 调用失败: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    username: string | null;
    public_id: string;
    credits: number;
    status: string;
    is_admin: boolean;
    registration_ip: string | null;
    same_ip_count: number;
    created_at: string;
    total_count: number;
  }[];
  const users = rows.flatMap((row) => {
    if (!isUserStatus(row.status)) return [];
    return [{
      id: row.id,
      username: row.username,
      publicId: row.public_id,
      credits: Number(row.credits),
      status: row.status,
      isAdmin: Boolean(row.is_admin),
      registrationIp: row.registration_ip,
      sameIpCount: Number(row.same_ip_count),
      createdAt: row.created_at,
    }];
  });
  return {
    users,
    total: Number(rows[0]?.total_count ?? 0),
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}
