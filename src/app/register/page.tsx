import Link from "next/link";
import { Info, Puzzle } from "lucide-react";

import { signUp } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";

export default async function RegisterPage({
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
              注册
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              创建账号后加入本月拼图互助，发布和领取都会更方便。
            </p>
          </div>
        </header>

        <section
          aria-label="注册表单"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div
            role="note"
            aria-label="注册说明"
            className="mb-5 flex gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm leading-5 text-blue-800"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <p>
              注册后请将微信群昵称改为用户名，并 @管理员审核。审核通过即获得 3 点信用。
            </p>
          </div>
          <AuthForm action={signUp} submitLabel="注册" redirectTo={redirectTo} />
        </section>

        <p className="text-center text-sm text-slate-500">
          已有账号?{" "}
          <Link
            href={
              redirectTo
                ? `/login?redirect=${encodeURIComponent(redirectTo)}`
                : "/login"
            }
            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            登录
          </Link>
        </p>
      </div>
    </main>
  );
}
