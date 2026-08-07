import { ShieldCheck, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
import {
  isCurrentUserAdmin,
  listUsers,
  USER_STATUSES,
  type UserStatus,
} from "@/features/auth/admin";
import { UserManagementActions } from "@/features/auth/components/user-management-actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<UserStatus | "ALL", string> = {
  ALL: "全部",
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  BANNED: "已封禁",
};

type AdminPageProps = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  if (!(await isCurrentUserAdmin())) notFound();

  const params = await searchParams;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = USER_STATUSES.includes(rawStatus as UserStatus)
    ? (rawStatus as UserStatus)
    : null;
  const users = await listUsers(status);

  return (
    <div className="space-y-6 px-4 py-6">
      <AccountSubpageHeader
        title="用户管理"
        description="查看全部账号，处理注册审核和账号状态。"
      />

      <section
        aria-label="封禁影响说明"
        className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
      >
        <p className="font-semibold">封禁影响</p>
        <p>
          封禁不会删除账号或历史记录。开放帖子会下架并退回求助信用；等待确认的求助会结束当前助力，未过期时按原截止时间重新开放，已过期时退款结束；已完成和已过期记录不变。
        </p>
      </section>

      <nav aria-label="用户状态筛选" className="flex flex-wrap gap-2">
        <FilterLink label="全部" active={status === null} />
        {USER_STATUSES.map((value) => (
          <FilterLink key={value} label={STATUS_LABELS[value]} value={value} active={status === value} />
        ))}
      </nav>

      {users.length === 0 ? (
        <EmptyState
          icon={status === "PENDING" ? ShieldCheck : UsersRound}
          title={status ? `暂无${STATUS_LABELS[status]}用户` : "暂无用户"}
          description="用户注册后会显示在这里。"
        />
      ) : (
        <ul className="space-y-3">
          {users.map((user) => (
            <li key={user.id} className="space-y-3 rounded-lg border border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {user.username ?? "(未命名)"}
                      {user.isAdmin ? (
                        <span className="ml-2 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          管理员
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">{user.publicId}</p>
                  </div>
                  <span className={statusClass(user.status)}>{STATUS_LABELS[user.status]}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>信用 {user.credits}</span>
                  <span>{user.registrationIp ?? "IP 未知"}</span>
                  <span>{formatCreatedAt(user.createdAt)}</span>
                  {user.sameIpCount > 1 ? (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                      同 IP {user.sameIpCount} 个账号
                    </span>
                  ) : null}
                </div>
              </div>
              <UserManagementActions
                targetId={user.id}
                status={user.status}
                isAdmin={user.isAdmin}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({
  label,
  value,
  active,
}: {
  label: string;
  value?: UserStatus;
  active: boolean;
}) {
  const href = value ? `/admin?status=${value}` : "/admin";
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
      }`}
    >
      {label}
    </a>
  );
}

function statusClass(status: UserStatus) {
  if (status === "BANNED") return "rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700";
  if (status === "PENDING") return "rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700";
  if (status === "REJECTED") return "rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600";
  return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700";
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "注册时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
