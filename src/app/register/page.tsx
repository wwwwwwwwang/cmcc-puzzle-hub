import Link from "next/link";

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
    <div className="space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          注册
        </h1>
        <p className="text-sm text-slate-500">
          用用户名注册后,请将微信群昵称改为与用户名一致,并 @管理员 审核。
          审核通过即获得 1 点信用:发布的赠送被他人领取可 +1,领取一次消耗 1 点。
        </p>
      </header>

      <AuthForm action={signUp} submitLabel="注册" redirectTo={redirectTo} />

      <p className="text-sm text-slate-500">
        已有账号?{" "}
        <Link
          href={
            redirectTo
              ? `/login?redirect=${encodeURIComponent(redirectTo)}`
              : "/login"
          }
          className="font-medium text-blue-600 hover:underline"
        >
          登录
        </Link>
      </p>
    </div>
  );
}
