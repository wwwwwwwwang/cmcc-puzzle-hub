import Link from "next/link";

import { getCreditOverview } from "@/features/posts/server/user-queries";
import { getAuthSession } from "@/lib/supabase/server";

// 依赖会话 Cookie,禁止静态预渲染。
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  SEED: "注册赠送",
  EARN_CLAIMED: "赠送被领取",
  SPEND_CLAIM: "领取消耗",
  REFUND: "退款",
};

export default async function MePage() {
  const [overview, session] = await Promise.all([
    getCreditOverview(),
    getAuthSession(),
  ]);

  if (!overview) {
    return (
      <div className="space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-950">我的账户</h1>
        <p className="text-sm text-slate-500">请先登录后查看信用与帖子。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          我的账户
        </h1>
        <p className="text-sm text-slate-500">
          用户标识 <code className="font-mono">{overview.publicId}</code>
        </p>
      </header>

      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm text-blue-700">当前信用</p>
        <p className="text-3xl font-bold text-blue-900">{overview.credits}</p>
        <p className="mt-1 text-xs text-blue-600">
          领取一次消耗 1 点;发布的赠送被他人领取 +1。
        </p>
      </section>

      <nav className="flex gap-3 text-sm">
        <Link href="/me/posts" className="font-medium text-blue-600 hover:underline">
          我的帖子
        </Link>
        <Link href="/me/claimed" className="font-medium text-blue-600 hover:underline">
          我领取的
        </Link>
        {session.isAdmin ? (
          <Link href="/admin" className="font-medium text-amber-600 hover:underline">
            用户审核
          </Link>
        ) : null}
      </nav>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">最近信用流水</h2>
        {overview.ledger.length === 0 ? (
          <p className="text-sm text-slate-400">暂无流水。</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {overview.ledger.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {REASON_LABELS[entry.reason] ?? entry.reason}
                </span>
                <span
                  className={
                    entry.delta >= 0
                      ? "font-semibold text-emerald-600"
                      : "font-semibold text-rose-600"
                  }
                >
                  {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
