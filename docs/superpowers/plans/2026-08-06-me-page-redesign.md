# “我的”页面组重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“我的账户”重构为账户概览工作台，并为“我的帖子”“我领取的”“用户审核”提供一致的二级页头、返回操作、列表和空状态。

**Architecture:** 保持四个路由页面为 Next.js 16 Server Components，继续在服务端完成会话、信用和列表查询。新增两个无状态展示组件：`AccountSubpageHeader` 统一固定返回 `/me` 的页面层级导航，`EmptyState` 统一空数据呈现；现有下架按钮和审核按钮继续作为独立 Client Components 嵌入服务端页面。

**Tech Stack:** Next.js 16.3 App Router、React 19、TypeScript、Tailwind CSS 4、Lucide React、Vitest、React Testing Library

---

## 文件结构

- Create: `src/features/account/components/account-subpage-header.tsx`：二级页面统一返回栏、标题和说明。
- Create: `src/features/account/components/account-subpage-header.test.tsx`：验证返回链接、标题和说明。
- Create: `src/features/account/components/empty-state.tsx`：统一图标、标题和说明的空状态。
- Create: `src/features/account/components/empty-state.test.tsx`：验证空状态语义、标题和说明。
- Create: `src/app/me/page.test.tsx`：验证账户概览、普通用户入口和管理员条件入口。
- Modify: `src/app/me/page.tsx`：重构为信用概览、快捷入口和信用流水。
- Create: `src/app/me/posts/page.test.tsx`：验证返回栏、空状态和可下架帖子。
- Modify: `src/app/me/posts/page.tsx`：应用共享页头、空状态和新版帖子列表。
- Create: `src/app/me/claimed/page.test.tsx`：验证返回栏、空状态和领取内容。
- Modify: `src/app/me/claimed/page.tsx`：应用共享页头、空状态和新版领取记录。
- Create: `src/app/admin/page.test.tsx`：验证管理员校验、返回栏、空状态和风险信息。
- Modify: `src/app/admin/page.tsx`：应用共享页头、空状态和新版审核列表。
- Create: `src/features/auth/components/review-buttons.test.tsx`：验证审核操作的语义分组和窄屏换行能力。
- Modify: `src/features/auth/components/review-buttons.tsx`：允许审核按钮与错误信息换行，避免窄屏挤压。

### Task 1: 建立共享二级页头和空状态组件

**Files:**
- Create: `src/features/account/components/account-subpage-header.test.tsx`
- Create: `src/features/account/components/account-subpage-header.tsx`
- Create: `src/features/account/components/empty-state.test.tsx`
- Create: `src/features/account/components/empty-state.tsx`

- [ ] **Step 1: 编写二级页头失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountSubpageHeader } from "./account-subpage-header";

describe("AccountSubpageHeader", () => {
  it("固定返回我的账户并展示标题说明", () => {
    render(
      <AccountSubpageHeader
        title="我的帖子"
        description="管理发布记录。"
      />,
    );

    expect(screen.getByRole("link", { name: "返回我的账户" })).toHaveAttribute(
      "href",
      "/me",
    );
    expect(screen.getByRole("heading", { level: 1, name: "我的帖子" })).toBeInTheDocument();
    expect(screen.getByText("管理发布记录。")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认因组件不存在而失败**

Run: `pnpm exec vitest run src/features/account/components/account-subpage-header.test.tsx`

Expected: FAIL，提示无法解析 `./account-subpage-header`。

- [ ] **Step 3: 实现二级页头最小版本**

```tsx
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type AccountSubpageHeaderProps = {
  title: string;
  description: string;
};

export function AccountSubpageHeader({
  title,
  description,
}: AccountSubpageHeaderProps) {
  return (
    <header className="space-y-3">
      <Link
        href="/me"
        aria-label="返回我的账户"
        className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: 运行二级页头测试确认通过**

Run: `pnpm exec vitest run src/features/account/components/account-subpage-header.test.tsx`

Expected: PASS，1 test passed。

- [ ] **Step 5: 编写空状态失败测试**

```tsx
import { FileText } from "lucide-react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("展示场景图标、标题和说明", () => {
    render(
      <EmptyState
        icon={FileText}
        title="还没有发布过拼图"
        description="发布后可以在这里查看状态。"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("还没有发布过拼图");
    expect(screen.getByText("发布后可以在这里查看状态。")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 运行测试确认因组件不存在而失败**

Run: `pnpm exec vitest run src/features/account/components/empty-state.test.tsx`

Expected: FAIL，提示无法解析 `./empty-state`。

- [ ] **Step 7: 实现空状态最小版本**

```tsx
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center"
    >
      <span className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}
```

- [ ] **Step 8: 运行共享组件测试确认通过**

Run: `pnpm exec vitest run src/features/account/components/account-subpage-header.test.tsx src/features/account/components/empty-state.test.tsx`

Expected: PASS，2 tests passed。

- [ ] **Step 9: 提交共享组件**

```bash
git add src/features/account/components/account-subpage-header.tsx src/features/account/components/account-subpage-header.test.tsx src/features/account/components/empty-state.tsx src/features/account/components/empty-state.test.tsx
git commit -m "feat: 添加账户二级页共享组件"
```

### Task 2: 重构“我的账户”概览工作台

**Files:**
- Create: `src/app/me/page.test.tsx`
- Modify: `src/app/me/page.tsx`

- [ ] **Step 1: 编写普通用户和管理员入口失败测试**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCreditOverview, getAuthSession } = vi.hoisted(() => ({
  getCreditOverview: vi.fn(),
  getAuthSession: vi.fn(),
}));

vi.mock("@/features/posts/server/user-queries", () => ({ getCreditOverview }));
vi.mock("@/lib/supabase/server", () => ({ getAuthSession }));

import MePage from "./page";

describe("MePage", () => {
  afterEach(cleanup);

  it("普通用户显示账户概览和两个入口", async () => {
    getCreditOverview.mockResolvedValue({
      credits: 2,
      publicId: "U-TEST",
      ledger: [],
    });
    getAuthSession.mockResolvedValue({ isAdmin: false });

    render(await MePage());

    expect(screen.getByLabelText("信用概览")).toHaveTextContent("2");
    expect(screen.getByRole("navigation", { name: "账户功能" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /我的帖子/ })).toHaveAttribute("href", "/me/posts");
    expect(screen.getByRole("link", { name: /我领取的/ })).toHaveAttribute("href", "/me/claimed");
    expect(screen.getByText("管理发布与状态")).toBeInTheDocument();
    expect(screen.getByText("查看口令与链接")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /用户审核/ })).not.toBeInTheDocument();
  });

  it("管理员额外显示用户审核入口", async () => {
    getCreditOverview.mockResolvedValue({ credits: 0, publicId: "U-ADMIN", ledger: [] });
    getAuthSession.mockResolvedValue({ isAdmin: true });

    render(await MePage());

    expect(screen.getByRole("link", { name: /用户审核/ })).toHaveAttribute("href", "/admin");
  });
});
```

- [ ] **Step 2: 运行测试确认新版语义结构尚不存在**

Run: `pnpm exec vitest run src/app/me/page.test.tsx`

Expected: FAIL，找不到 aria-label 为“信用概览”或“账户功能”的区域。

- [ ] **Step 3: 重构页面为概览工作台**

在 `src/app/me/page.tsx` 中：

```tsx
import {
  ChevronRight,
  ClipboardList,
  Gift,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
```

将登录后的主体替换为以下结构；保留文件顶部现有 `REASON_LABELS` 常量：

```tsx
<div className="space-y-6 px-4 py-6">
  <header className="space-y-1">
    <h1 className="text-2xl font-bold tracking-tight text-slate-950">我的账户</h1>
    <p className="text-sm text-slate-500">
      用户标识 <code className="font-mono text-slate-700">{overview.publicId}</code>
    </p>
  </header>

  <section className="rounded-lg border border-blue-100 bg-blue-50 p-4" aria-label="信用概览">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-blue-700">当前信用</p>
        <p className="mt-1 text-3xl font-bold text-blue-950">{overview.credits}</p>
      </div>
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
        <Sparkles aria-hidden="true" className="size-5" />
      </span>
    </div>
    <p className="mt-3 text-xs leading-5 text-blue-700">领取一次消耗 1 点；发布的赠送被他人领取可获得 1 点。</p>
  </section>

  <nav aria-label="账户功能" className="grid grid-cols-2 gap-3">
    <AccountLink href="/me/posts" icon={ClipboardList} title="我的帖子" description="管理发布与状态" />
    <AccountLink href="/me/claimed" icon={Gift} title="我领取的" description="查看口令与链接" />
    {session.isAdmin ? (
      <AccountLink className="col-span-2" href="/admin" icon={ShieldCheck} title="用户审核" description="处理待审核用户" />
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
          <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-600">
              {REASON_LABELS[entry.reason] ?? entry.reason}
            </span>
            <span className={entry.delta >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
              {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
</div>
```

同文件增加局部 `AccountLink` 组件：

```tsx
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
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
    </Link>
  );
}
```

同时从 `lucide-react` 导入 `type LucideIcon`。

- [ ] **Step 4: 运行“我的账户”测试确认通过**

Run: `pnpm exec vitest run src/app/me/page.test.tsx`

Expected: PASS，2 tests passed。

- [ ] **Step 5: 提交账户概览重构**

```bash
git add src/app/me/page.tsx src/app/me/page.test.tsx
git commit -m "feat: 重构我的账户概览"
```

### Task 3: 优化“我的帖子”和“我领取的”

**Files:**
- Create: `src/app/me/posts/page.test.tsx`
- Modify: `src/app/me/posts/page.tsx`
- Create: `src/app/me/claimed/page.test.tsx`
- Modify: `src/app/me/claimed/page.tsx`

- [ ] **Step 1: 编写“我的帖子”失败测试**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyPosts } = vi.hoisted(() => ({ getMyPosts: vi.fn() }));
vi.mock("@/features/posts/server/user-queries", () => ({ getMyPosts }));
vi.mock("@/features/posts/components/delist-button", () => ({
  DelistButton: ({ postId }: { postId: string }) => <button>下架 {postId}</button>,
}));

import MyPostsPage from "./page";

describe("MyPostsPage", () => {
  afterEach(cleanup);

  it("空数据时显示返回链接和空状态", async () => {
    getMyPosts.mockResolvedValue([]);
    render(await MyPostsPage());

    expect(screen.getByRole("link", { name: "返回我的账户" })).toHaveAttribute("href", "/me");
    expect(screen.getByRole("status")).toHaveTextContent("还没有发布过拼图");
  });

  it("只有可领取帖子显示下架操作", async () => {
    getMyPosts.mockResolvedValue([
      { id: "open", type: "GIVE", discount: 80, pieceNumber: 1, status: "OPEN" },
      { id: "claimed", type: "REQUEST", discount: 90, pieceNumber: 2, status: "CLAIMED" },
    ]);
    render(await MyPostsPage());

    expect(screen.getByRole("button", { name: "下架 open" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下架 claimed" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认共享页头和空状态尚未接入**

Run: `pnpm exec vitest run src/app/me/posts/page.test.tsx`

Expected: FAIL，找不到“返回我的账户”链接或 `status` 空状态。

- [ ] **Step 3: 重构“我的帖子”页面**

导入：

```tsx
import { ClipboardList } from "lucide-react";
import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
```

页面主体使用：

```tsx
<div className="space-y-6 px-4 py-6">
  <AccountSubpageHeader
    title="我的帖子"
    description="查看发布状态；仅“可领取”状态的帖子可以主动下架。"
  />
  {posts.length === 0 ? (
    <EmptyState
      icon={ClipboardList}
      title="还没有发布过拼图"
      description="发布成功后，可以在这里查看状态并管理可领取的帖子。"
    />
  ) : (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第 {post.pieceNumber} 块
            </p>
            <p className="text-xs text-slate-500">{postStatusLabel(post.status)}</p>
          </div>
          {post.status === "OPEN" ? <DelistButton postId={post.id} /> : null}
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 4: 运行“我的帖子”测试确认通过**

Run: `pnpm exec vitest run src/app/me/posts/page.test.tsx`

Expected: PASS，2 tests passed。

- [ ] **Step 5: 编写“我领取的”失败测试**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyClaimedPosts } = vi.hoisted(() => ({ getMyClaimedPosts: vi.fn() }));
vi.mock("@/features/posts/server/user-queries", () => ({ getMyClaimedPosts }));

import ClaimedPostsPage from "./page";

describe("ClaimedPostsPage", () => {
  afterEach(cleanup);

  it("空数据时显示返回链接和空状态", async () => {
    getMyClaimedPosts.mockResolvedValue([]);
    render(await ClaimedPostsPage());

    expect(screen.getByRole("link", { name: "返回我的账户" })).toHaveAttribute("href", "/me");
    expect(screen.getByRole("status")).toHaveTextContent("还没有领取过拼图");
  });

  it("展示可换行的口令与外部链接", async () => {
    getMyClaimedPosts.mockResolvedValue([{
      id: "claimed",
      type: "GIVE",
      discount: 80,
      pieceNumber: 3,
      payloads: { command: "长口令内容", url: "https://example.com/puzzle" },
    }]);
    render(await ClaimedPostsPage());

    expect(screen.getByText("长口令内容")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.com/puzzle" })).toHaveAttribute("target", "_blank");
  });
});
```

- [ ] **Step 6: 运行测试确认共享页头和空状态尚未接入**

Run: `pnpm exec vitest run src/app/me/claimed/page.test.tsx`

Expected: FAIL，找不到“返回我的账户”链接或 `status` 空状态。

- [ ] **Step 7: 重构“我领取的”页面**

导入：

```tsx
import { Gift } from "lucide-react";
import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
```

页面主体使用：

```tsx
<div className="space-y-6 px-4 py-6">
  <AccountSubpageHeader
    title="我领取的"
    description="保留领取成功的口令或链接，方便再次查看和使用。"
  />
  {posts.length === 0 ? (
    <EmptyState
      icon={Gift}
      title="还没有领取过拼图"
      description="领取成功后，口令或链接会保留在这里。"
    />
  ) : (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id} className="space-y-3 rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第 {post.pieceNumber} 块
          </p>
          {post.payloads.command ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-500">口令</p>
              <code className="mt-1 block break-all font-mono text-sm text-slate-800">
                {post.payloads.command}
              </code>
            </div>
          ) : null}
          {post.payloads.url ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-500">链接</p>
              <a
                href={post.payloads.url}
                className="mt-1 block break-all text-sm text-blue-600 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {post.payloads.url}
              </a>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 8: 运行两个二级页测试确认通过**

Run: `pnpm exec vitest run src/app/me/posts/page.test.tsx src/app/me/claimed/page.test.tsx`

Expected: PASS，4 tests passed。

- [ ] **Step 9: 提交用户帖子页面重构**

```bash
git add src/app/me/posts/page.tsx src/app/me/posts/page.test.tsx src/app/me/claimed/page.tsx src/app/me/claimed/page.test.tsx
git commit -m "feat: 优化用户帖子记录页面"
```

### Task 4: 优化管理员审核页面并保持权限边界

**Files:**
- Create: `src/app/admin/page.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Create: `src/features/auth/components/review-buttons.test.tsx`
- Modify: `src/features/auth/components/review-buttons.tsx`

- [ ] **Step 1: 编写管理员页面失败测试**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { isCurrentUserAdmin, listPendingUsers, notFound } = vi.hoisted(() => ({
  isCurrentUserAdmin: vi.fn(),
  listPendingUsers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/admin", () => ({ isCurrentUserAdmin, listPendingUsers }));
vi.mock("@/features/auth/components/review-buttons", () => ({
  ReviewButtons: ({ targetId }: { targetId: string }) => <div>审核 {targetId}</div>,
}));

import AdminPage from "./page";

describe("AdminPage", () => {
  afterEach(cleanup);

  it("非管理员继续返回 404", async () => {
    isCurrentUserAdmin.mockResolvedValue(false);
    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("管理员空数据时显示返回链接和空状态", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listPendingUsers.mockResolvedValue([]);
    render(await AdminPage());

    expect(screen.getByRole("link", { name: "返回我的账户" })).toHaveAttribute("href", "/me");
    expect(screen.getByRole("status")).toHaveTextContent("暂无待审核用户");
  });

  it("突出同 IP 多账号风险并保留审核操作", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listPendingUsers.mockResolvedValue([{
      id: "user-1",
      username: "测试用户",
      registrationIp: "127.0.0.1",
      sameIpCount: 2,
    }]);
    render(await AdminPage());

    expect(screen.getByText("同 IP 2 个账号")).toBeInTheDocument();
    expect(screen.getByText("审核 user-1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认共享页头和空状态尚未接入**

Run: `pnpm exec vitest run src/app/admin/page.test.tsx`

Expected: FAIL，管理员页面找不到返回链接或 `status` 空状态；非管理员测试保持通过。

- [ ] **Step 3: 重构管理员页面**

导入：

```tsx
import { ShieldCheck } from "lucide-react";
import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
```

保留文件开头的管理员校验，并将渲染结构替换为：

```tsx
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
        <li key={user.id} className="rounded-lg border border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
```

- [ ] **Step 4: 运行管理员页面测试确认通过**

Run: `pnpm exec vitest run src/app/admin/page.test.tsx`

Expected: PASS，3 tests passed。

- [ ] **Step 5: 编写审核操作布局失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../admin-actions", () => ({
  approveUser: vi.fn(async () => ({})),
  rejectUser: vi.fn(async () => ({})),
}));

import { ReviewButtons } from "./review-buttons";

describe("ReviewButtons", () => {
  it("将审核操作分组并允许窄屏换行", () => {
    render(<ReviewButtons targetId="user-1" />);

    const group = screen.getByRole("group", { name: "审核操作" });
    expect(group).toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "通过" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 运行审核操作测试确认新版语义不存在**

Run: `pnpm exec vitest run src/features/auth/components/review-buttons.test.tsx`

Expected: FAIL，找不到名称为“审核操作”的 `group`。

- [ ] **Step 7: 让审核操作支持语义分组和窄屏换行**

将 `ReviewButtons` 的根节点和错误提示更新为：

```tsx
<div role="group" aria-label="审核操作" className="flex flex-wrap items-center gap-2">
  <form action={approveAction}>
    <input type="hidden" name="targetId" value={targetId} />
    <Button type="submit" size="sm" disabled={approving}>
      {approving ? "处理中…" : "通过"}
    </Button>
  </form>
  <form action={rejectAction}>
    <input type="hidden" name="targetId" value={targetId} />
    <Button type="submit" size="sm" variant="destructive" disabled={rejecting}>
      {rejecting ? "处理中…" : "拒绝"}
    </Button>
  </form>
  {message ? (
    <span className="basis-full text-xs text-destructive">{message}</span>
  ) : null}
</div>
```

- [ ] **Step 8: 运行管理员相关测试确认通过**

Run: `pnpm exec vitest run src/app/admin/page.test.tsx src/features/auth/components/review-buttons.test.tsx`

Expected: PASS，4 tests passed。

- [ ] **Step 9: 提交管理员页面重构**

```bash
git add src/app/admin/page.tsx src/app/admin/page.test.tsx src/features/auth/components/review-buttons.tsx src/features/auth/components/review-buttons.test.tsx
git commit -m "feat: 优化用户审核页面"
```

### Task 5: 完整验证与视觉检查

**Files:**
- Verify: `src/features/account/components/*.tsx`
- Verify: `src/app/me/page.tsx`
- Verify: `src/app/me/posts/page.tsx`
- Verify: `src/app/me/claimed/page.tsx`
- Verify: `src/app/admin/page.tsx`

- [ ] **Step 1: 运行本次新增的聚焦测试**

Run:

```bash
pnpm exec vitest run src/features/account/components/account-subpage-header.test.tsx src/features/account/components/empty-state.test.tsx src/app/me/page.test.tsx src/app/me/posts/page.test.tsx src/app/me/claimed/page.test.tsx src/app/admin/page.test.tsx src/features/auth/components/review-buttons.test.tsx
```

Expected: PASS，所有新增测试通过，0 failed。

- [ ] **Step 2: 运行完整单元测试**

Run: `pnpm test:unit`

Expected: PASS，0 failed。

- [ ] **Step 3: 运行类型检查和 lint**

Run: `pnpm typecheck`

Expected: exit 0，无 TypeScript 错误。

Run: `pnpm lint`

Expected: exit 0，无 ESLint 错误。

- [ ] **Step 4: 运行生产构建**

Run: `pnpm build`

Expected: exit 0，Next.js 16.3 构建完成。

- [ ] **Step 5: 启动本地开发服务器并做浏览器验证**

Run: `pnpm dev`

在可用端口打开以下路由：

- `/me`
- `/me/posts`
- `/me/claimed`
- `/admin`（管理员会话）

分别检查 390×844 和 420×900 视口：返回按钮可点击且指向 `/me`，普通用户无审核入口，管理员有审核入口，长链接不溢出，审核按钮不遮挡用户信息，底部导航不遮挡正文。

- [ ] **Step 6: 检查最终差异**

Run: `git diff --check`

Expected: exit 0，无空白错误。

Run: `git status --short`

Expected: 只包含本计划产生且尚未提交的预期文件；若各任务均已提交则工作区为空。
