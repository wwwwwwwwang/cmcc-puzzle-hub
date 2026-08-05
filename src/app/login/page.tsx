import Link from "next/link";

import { signIn } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = typeof redirect === "string" ? redirect : undefined;

  return (
    <div className="space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          登录
        </h1>
        <p className="text-sm text-slate-500">
          登录后即可发布拼图、领取他人分享并管理自己的帖子。
        </p>
      </header>

      <AuthForm action={signIn} submitLabel="登录" redirectTo={redirectTo} />

      <p className="text-sm text-slate-500">
        还没有账号?{" "}
        <Link
          href={
            redirectTo
              ? `/register?redirect=${encodeURIComponent(redirectTo)}`
              : "/register"
          }
          className="font-medium text-blue-600 hover:underline"
        >
          注册
        </Link>
      </p>
    </div>
  );
}
