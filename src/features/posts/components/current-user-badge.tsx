"use client";

import Link from "next/link";

import { useAuthSession } from "@/features/auth/auth-session";

export function CurrentUserBadge() {
  const { isAuthenticated, publicId } = useAuthSession();

  if (isAuthenticated && publicId) {
    return (
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
        <span className="font-medium">当前用户</span>
        <span aria-hidden="true">·</span>
        <code className="truncate font-mono font-semibold">{publicId}</code>
      </div>
    );
  }

  return (
    <Link
      href="/login?redirect=/"
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
    >
      登录 / 注册
    </Link>
  );
}
