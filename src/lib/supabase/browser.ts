import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase 客户端(anon key)。用于客户端组件读取会话、订阅认证状态。
 * 绝不在此使用 service role key。
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY 必须配置",
    );
  }

  return createBrowserClient(url, anonKey);
}
