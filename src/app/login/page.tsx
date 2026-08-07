import Link from "next/link";
import { Puzzle } from "lucide-react";

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
    <main className="min-h-dvh bg-slate-100 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-blue-600">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Puzzle aria-hidden="true" className="size-4" />
            </span>
            <span>拼图互助</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              登录
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              登录后即可发布拼图、领取他人分享并管理自己的帖子。
            </p>
          </div>
        </header>

        <section
          aria-label="登录表单"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <AuthForm action={signIn} submitLabel="登录" redirectTo={redirectTo} />
        </section>

        <p className="text-center text-sm text-slate-500">
          还没有账号?{" "}
          <Link
            href={
              redirectTo
                ? `/register?redirect=${encodeURIComponent(redirectTo)}`
                : "/register"
            }
            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            注册
          </Link>
        </p>
      </div>
    </main>
  );
}
