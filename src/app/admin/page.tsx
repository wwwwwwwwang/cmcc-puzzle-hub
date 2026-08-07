import { ShieldCheck, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
import {
  isCurrentUserAdmin,
  listUsers,
  USER_STATUSES,
  USER_PAGE_SIZE,
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
  searchParams: Promise<{
    status?: string | string[];
    search?: string | string[];
    ip?: string | string[];
    page?: string | string[];
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  if (!(await isCurrentUserAdmin())) notFound();

  const params = await searchParams;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const rawSearch = Array.isArray(params.search) ? params.search[0] : params.search;
  const search = rawSearch?.trim() ?? "";
  const rawIp = Array.isArray(params.ip) ? params.ip[0] : params.ip;
  const registrationIp = rawIp?.trim() ?? "";
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number.isInteger(Number(rawPage)) && Number(rawPage) > 0 ? Number(rawPage) : 1;
  const status = USER_STATUSES.includes(rawStatus as UserStatus)
    ? (rawStatus as UserStatus)
    : null;
  const result = await listUsers(status, search, registrationIp, page, USER_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-6 px-4 py-6">
      <AccountSubpageHeader
        title="用户管理"
        description="查看全部账号，处理注册审核和账号状态。"
      />

      <form action="/admin" className="flex items-end gap-2" role="search">
        {registrationIp ? <input type="hidden" name="ip" value={registrationIp} /> : null}
        <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-slate-600">
          <span>搜索用户名</span>
          <input
            aria-label="搜索用户名"
            name="search"
            type="search"
            defaultValue={search}
            placeholder="输入用户名"
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <button type="submit" className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
          搜索
        </button>
      </form>

      <nav aria-label="用户状态筛选" className="flex flex-wrap gap-2">
        <FilterLink label="全部" active={status === null} search={search} registrationIp={registrationIp} />
        {USER_STATUSES.map((value) => (
          <FilterLink key={value} label={STATUS_LABELS[value]} value={value} active={status === value} search={search} registrationIp={registrationIp} />
        ))}
      </nav>

      {registrationIp ? (
        <div aria-label="注册 IP 筛选" className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span>正在查看注册 IP：{registrationIp}</span>
          <a href={adminHref({ status, search, registrationIp: "", page: 1 })} className="font-medium text-blue-700 hover:underline">
            清除筛选
          </a>
        </div>
      ) : null}

      {result.users.length === 0 ? (
        <EmptyState
          icon={status === "PENDING" ? ShieldCheck : UsersRound}
          title={status ? `暂无${STATUS_LABELS[status]}用户` : "暂无用户"}
          description="用户注册后会显示在这里。"
        />
      ) : (
        <ul className="space-y-3">
          {result.users.map((user) => (
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
                  {user.sameIpCount > 1 && user.registrationIp ? (
                    <a href={adminHref({ status, search, registrationIp: user.registrationIp, page: 1 })} className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 hover:bg-amber-200">
                      同 IP {user.sameIpCount} 个账号
                    </a>
                  ) : null}
                </div>
              </div>
              <UserManagementActions
                targetId={user.id}
                status={user.status}
                isAdmin={user.isAdmin}
                rejectionReason={user.rejectionReason}
              />
            </li>
          ))}
        </ul>
      )}

      {result.total > 0 ? (
        <nav aria-label="用户分页" className="flex items-center justify-between gap-3 text-sm">
          {result.page > 1 ? (
            <a href={adminHref({ status, search, registrationIp, page: result.page - 1 })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-blue-200 hover:text-blue-700">
              上一页
            </a>
          ) : <span />}
          <span className="text-xs text-slate-500">第 {result.page} / {totalPages} 页，共 {result.total} 个用户</span>
          {result.page < totalPages ? (
            <a href={adminHref({ status, search, registrationIp, page: result.page + 1 })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:border-blue-200 hover:text-blue-700">
              下一页
            </a>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}

function FilterLink({
  label,
  value,
  active,
  search,
  registrationIp,
}: {
  label: string;
  value?: UserStatus;
  active: boolean;
  search: string;
  registrationIp: string;
}) {
  const href = adminHref({ status: value ?? null, search, registrationIp, page: 1 });
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

function adminHref({
  status,
  search,
  registrationIp,
  page,
}: {
  status: UserStatus | null;
  search: string;
  registrationIp: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  if (registrationIp) params.set("ip", registrationIp);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
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
