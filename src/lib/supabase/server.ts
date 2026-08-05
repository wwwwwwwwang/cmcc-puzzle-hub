import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 服务端 Supabase 客户端(anon key + 用户会话 Cookie)。
 * 用于 Server Components / Server Actions / Route Handlers 中读取当前登录用户,
 * RLS 以该用户身份生效。
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY 必须配置",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 在 Server Component 中调用 setAll 会抛错;会话刷新交由 proxy.ts 处理。
        }
      },
    },
  });
}

/**
 * 读取当前登录用户;未登录返回 null。
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * 读取当前会话的公开身份(供客户端 AuthSession 初始化)。
 * 未登录返回 { isAuthenticated: false, publicId: null }。
 */
export type SessionProfile = {
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  publicId: string | null;
  username: string | null;
};

const ANON_SESSION: SessionProfile = {
  isAuthenticated: false,
  isApproved: false,
  isAdmin: false,
  publicId: null,
  username: null,
};

export async function getAuthSession(): Promise<SessionProfile> {
  // 构建期(或未配置 Supabase)时降级为未登录,避免预渲染失败;
  // 运行期在 Vercel 上环境变量必然存在。
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return ANON_SESSION;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return ANON_SESSION;

  const { data: profile } = await supabase
    .from("profiles")
    .select("public_id, username, status, is_admin")
    .eq("id", user.id)
    .single();

  return {
    isAuthenticated: true,
    isApproved: profile?.status === "APPROVED",
    isAdmin: Boolean(profile?.is_admin),
    publicId: (profile?.public_id as string | undefined) ?? null,
    username: (profile?.username as string | undefined) ?? null,
  };
}

/**
 * 返回已通过审核的用户;未登录或未审核返回 null。供写接口门控。
 */
export async function getApprovedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  return profile?.status === "APPROVED" ? user : null;
}
