import { notFound } from "next/navigation";

import { ReviewButtons } from "@/features/auth/components/review-buttons";
import { isCurrentUserAdmin, listPendingUsers } from "@/features/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // 非管理员一律 404,不暴露该页存在。
  if (!(await isCurrentUserAdmin())) {
    notFound();
  }

  const pending = await listPendingUsers();

  return (
    <div className="space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          用户审核
        </h1>
        <p className="text-sm text-slate-500">
          核对用户名与微信群昵称一致后再通过。同一 IP 注册多个账号会标黄提示,请留意。
        </p>
      </header>

      {pending.length === 0 ? (
        <p className="text-sm text-slate-400">暂无待审核用户。</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((user) => (
            <li
              key={user.id}
              className="space-y-2 rounded-lg border border-slate-100 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-medium text-slate-900">
                    {user.username ?? "(未命名)"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {user.registrationIp ?? "IP 未知"}
                    {user.sameIpCount > 1 ? (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                        同 IP {user.sameIpCount} 个账号
                      </span>
                    ) : null}
                  </p>
                </div>
                <ReviewButtons targetId={user.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
