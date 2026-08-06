import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  E2E_AUTH_COOKIE,
  getE2eAuthSession,
} from "@/lib/testing/e2e-auth";

// Next.js 16:middleware 已重命名为 proxy。此文件负责刷新 Supabase 会话,
// 并保护需要登录的路由(发布页、自管理页)。API 路由自身也会二次校验会话。

const PROTECTED_PREFIXES = ["/publish", "/me"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (getE2eAuthSession(request.cookies.get(E2E_AUTH_COOKIE)?.value)) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // 必须调用 getUser 以触发会话刷新(勿在其间插入其他逻辑)。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // 除静态资源与 favicon 外的所有路由。
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
