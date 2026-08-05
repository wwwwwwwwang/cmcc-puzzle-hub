import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * 管理端 Supabase 客户端(service role key)。绕过 RLS,仅用于服务端调用
 * SECURITY DEFINER RPC(publish_post / claim_post / delist_post)。
 * 绝不暴露给客户端;调用方必须先自行校验会话与归属。
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 必须配置",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
