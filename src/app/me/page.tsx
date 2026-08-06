import {
  ChevronRight,
  ClipboardList,
  Gift,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
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

      <section
        aria-label="信用概览"
        className="rounded-lg border border-blue-100 bg-blue-50 p-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-700">当前信用</p>
            <p className="mt-1 text-3xl font-bold text-blue-950">
              {overview.credits}
            </p>
          </div>
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-blue-700">
          领取一次消耗 1 点；发布的赠送被他人领取可获得 1 点。
        </p>
      </section>

      <nav aria-label="账户功能" className="grid grid-cols-2 gap-3">
        <AccountLink
          href="/me/posts"
          icon={ClipboardList}
          title="我的帖子"
          description="管理发布与状态"
        />
        <AccountLink
          href="/me/claimed"
          icon={Gift}
          title="我领取的"
          description="查看口令与链接"
        />
        {session.isAdmin ? (
          <AccountLink
            className="col-span-2"
            href="/admin"
            icon={ShieldCheck}
            title="用户审核"
            description="处理待审核用户"
          />
        ) : null}
      </nav>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">最近信用流水</h2>
        {overview.ledger.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            暂无信用流水
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {overview.ledger.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
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

function AccountLink({
  href,
  icon: Icon,
  title,
  description,
  className = "",
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-24 items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/50 ${className}`}
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-white group-hover:text-blue-600">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-slate-400"
      />
    </Link>
  );
}
