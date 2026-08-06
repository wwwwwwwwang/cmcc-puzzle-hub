# 首页账户展示与退出登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除首页账户提示，并在“我的”页面增加带二次确认的退出登录操作。

**Architecture:** 首页直接删除不再需要的客户端账户徽标。退出登录使用独立客户端组件管理 `Drawer` 开关和表单提交状态，继续复用现有 `signOut` 服务端 action；“我的”页面保持服务端数据获取职责。

**Tech Stack:** Next.js 16 App Router、React 19 Server Actions、Base UI Drawer、Testing Library、Vitest、Tailwind CSS、Lucide React

---

### Task 1: 移除首页账户提示

**Files:**
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/features/posts/components/current-user-badge.tsx`
- Delete: `src/features/posts/components/current-user-badge.test.tsx`

- [ ] **Step 1: 写入首页失败测试**

删除 `CurrentUserBadge` mock，并在“显示网站名称”用例中加入：

```tsx
expect(screen.queryByText("当前用户测试标识")).not.toBeInTheDocument();
expect(
  screen.queryByRole("link", { name: "登录 / 注册" }),
).not.toBeInTheDocument();
```

为了让测试真实捕获现状，暂时保留 mock 并将第一条断言改为查询现有 mock 文案；运行后应因首页仍渲染该文案而失败。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/app/page.test.tsx`

Expected: FAIL，提示仍能找到“当前用户测试标识”。

- [ ] **Step 3: 写入最小实现**

从 `src/app/page.tsx` 删除：

```tsx
import { CurrentUserBadge } from "@/features/posts/components/current-user-badge";
```

以及标题和筛选器之间的：

```tsx
<div className="mb-4">
  <CurrentUserBadge />
</div>
```

同时删除已无调用的 `current-user-badge.tsx` 和其独立测试，并从首页测试删除对应 mock。

- [ ] **Step 4: 运行首页测试确认通过**

Run: `pnpm vitest run src/app/page.test.tsx`

Expected: PASS，首页名称和筛选参数用例全部通过。

- [ ] **Step 5: 提交首页调整**

```bash
git add src/app/page.tsx src/app/page.test.tsx src/features/posts/components/current-user-badge.tsx src/features/posts/components/current-user-badge.test.tsx
git commit -m "refactor: 移除首页账户提示"
```

### Task 2: 在“我的”页面接入退出入口

**Files:**
- Create: `src/features/auth/components/sign-out-control.tsx`
- Modify: `src/app/me/page.tsx`
- Modify: `src/app/me/page.test.tsx`

- [ ] **Step 1: 写入“我的”页面失败测试**

在普通用户用例中增加用户标识和退出按钮断言：

```tsx
expect(screen.getByText("U-TEST")).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "退出登录" }),
).toBeInTheDocument();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/app/me/page.test.tsx`

Expected: FAIL，提示找不到“退出登录”按钮；用户标识断言通过。

- [ ] **Step 3: 写入最小接入实现**

创建 `src/features/auth/components/sign-out-control.tsx`：

```tsx
"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutControl() {
  return (
    <Button type="button" variant="outline" className="h-11 w-full text-rose-600">
      <LogOut data-icon="inline-start" />
      退出登录
    </Button>
  );
}
```

在 `src/app/me/page.tsx` 导入 `SignOutControl`，并在信用流水区块之后渲染：

```tsx
<SignOutControl />
```

- [ ] **Step 4: 运行“我的”页面测试确认通过**

Run: `pnpm vitest run src/app/me/page.test.tsx`

Expected: PASS，用户标识和退出入口均存在。

### Task 3: 实现退出二次确认抽屉

**Files:**
- Create: `src/features/auth/components/sign-out-control.test.tsx`
- Modify: `src/features/auth/components/sign-out-control.tsx`

- [ ] **Step 1: 写入退出交互失败测试**

创建组件测试，mock 现有服务端 action：

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }));

vi.mock("@/features/auth/actions", () => ({ signOut }));

import { SignOutControl } from "./sign-out-control";

describe("SignOutControl", () => {
  afterEach(() => {
    cleanup();
    signOut.mockClear();
  });

  it("打开确认面板并可取消", async () => {
    render(<SignOutControl />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(screen.getByText("确认退出登录？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() =>
      expect(screen.queryByText("确认退出登录？")).not.toBeInTheDocument(),
    );
  });

  it("确认后提交现有登出 action", async () => {
    render(<SignOutControl />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    fireEvent.click(screen.getByRole("button", { name: "确认退出" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/features/auth/components/sign-out-control.test.tsx`

Expected: FAIL，最小组件尚未渲染确认面板。

- [ ] **Step 3: 写入确认抽屉实现**

将 `SignOutControl` 扩展为受控 `Drawer`：

```tsx
"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { signOut } from "@/features/auth/actions";

export function SignOutControl() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full border-rose-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={() => setOpen(true)}
      >
        <LogOut data-icon="inline-start" />
        退出登录
      </Button>
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent className="mx-auto max-w-[420px] rounded-t-[20px] border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <DrawerHeader>
            <DrawerTitle>确认退出登录？</DrawerTitle>
            <DrawerDescription>
              退出后将返回首页，需要重新登录才能继续使用账户功能。
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pt-5">
            <form action={signOut}>
              <SubmitButton />
            </form>
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" className="h-11 w-full" disabled={pending}>
      <LogOut data-icon="inline-start" />
      {pending ? "退出中…" : "确认退出"}
    </Button>
  );
}
```

- [ ] **Step 4: 运行退出组件与页面测试确认通过**

Run: `pnpm vitest run src/features/auth/components/sign-out-control.test.tsx src/app/me/page.test.tsx`

Expected: PASS，确认面板、取消操作、服务端 action 提交和页面入口全部通过。

- [ ] **Step 5: 提交退出登录功能**

```bash
git add src/features/auth/components/sign-out-control.tsx src/features/auth/components/sign-out-control.test.tsx src/app/me/page.tsx src/app/me/page.test.tsx
git commit -m "feat: 添加退出登录二次确认"
```

### Task 4: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 检查格式和静态问题**

Run: `git diff --check`

Expected: exit 0，无空白错误。

- [ ] **Step 2: 运行完整单元测试**

Run: `pnpm test:unit`

Expected: exit 0，所有非集成单元测试通过。

- [ ] **Step 3: 运行类型检查**

Run: `pnpm typecheck`

Expected: exit 0，无 TypeScript 错误。

- [ ] **Step 4: 运行代码检查**

Run: `pnpm lint`

Expected: exit 0，无 ESLint 错误。

- [ ] **Step 5: 运行生产构建**

Run: `pnpm build`

Expected: exit 0，Next.js 生产构建成功。
