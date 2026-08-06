import { ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
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
      <AccountSubpageHeader
        title="用户审核"
        description="核对用户名与微信群昵称一致后再通过；同一 IP 注册多个账号会标黄提示。"
      />

      {pending.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="暂无待审核用户"
          description="新的注册申请会显示在这里。"
        />
      ) : (
        <ul className="space-y-3">
          {pending.map((user) => (
            <li
              key={user.id}
              className="rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="flex flex-col gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {user.username ?? "(未命名)"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{user.registrationIp ?? "IP 未知"}</span>
                    {user.sameIpCount > 1 ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                        同 IP {user.sameIpCount} 个账号
                      </span>
                    ) : null}
                  </div>
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
