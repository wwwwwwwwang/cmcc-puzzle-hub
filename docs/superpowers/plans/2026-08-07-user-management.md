# 用户管理与封禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将仅展示待审核用户的管理员页面升级为可筛选全部用户、保留审核并支持可逆封禁的用户管理页。

**Architecture:** Supabase 迁移负责用户状态约束、管理员列表查询以及原子封禁/解封；Next.js Server Components 负责权限和筛选，Server Actions 负责业务状态映射与缓存刷新，客户端操作组件负责二次确认。现有登录和写接口继续以 `APPROVED` 为门控，并补充封禁专用提示。

**Tech Stack:** Next.js 16.3 App Router、React、TypeScript、Supabase PostgreSQL RPC、Tailwind CSS、Vitest、Testing Library。

---

### Task 1: 用迁移测试锁定用户管理数据库契约

**Files:**
- Create: `supabase/migrations/0007_user_management.sql`
- Create: `src/features/auth/user-management-migration.test.ts`

- [ ] **Step 1: 写失败测试**

读取迁移 SQL，断言包含 `BANNED` 状态、`list_users`、`ban_user`、`unban_user`、自封禁和管理员目标保护、求助退款、待确认助力拒绝、活跃去重清理，以及大厅和助力函数对封禁发布者的门控。

- [ ] **Step 2: 运行测试确认 RED**

运行：`pnpm exec vitest run src/features/auth/user-management-migration.test.ts`

预期：因 `0007_user_management.sql` 不存在而失败。

- [ ] **Step 3: 编写最小迁移**

迁移重建 `profiles.status` 检查约束，新增三个 `security definer` RPC。`ban_user` 在同一事务中更新用户状态、处理 `OPEN` 和 `PENDING_CONFIRM` 帖子及信用流水；`unban_user` 只恢复为 `APPROVED`。重建大厅/助力相关函数时保持原签名和既有行为，仅增加发布者非 `BANNED` 条件。

- [ ] **Step 4: 运行测试确认 GREEN**

运行：`pnpm exec vitest run src/features/auth/user-management-migration.test.ts src/features/auth/approval-migration.test.ts src/features/posts/server/request-help-migration.test.ts`

预期：全部通过。

### Task 2: 扩展服务端用户查询与管理 action

**Files:**
- Modify: `src/features/auth/admin.ts`
- Modify: `src/features/auth/admin-actions.ts`
- Create: `src/features/auth/admin.test.ts`
- Create: `src/features/auth/admin-actions.test.ts`
- Modify: `src/features/auth/actions.test.ts`
- Modify: `src/features/auth/actions.ts`

- [ ] **Step 1: 写查询和 action 失败测试**

断言 `listUsers` 把可选状态传给 `list_users` 并映射 `credits/status/is_admin`；断言 `banUser`、`unbanUser` 调用对应 RPC，正确处理 `SELF_FORBIDDEN`、`ADMIN_TARGET_FORBIDDEN`、`NOT_FOUND` 和成功状态；登录测试断言 `BANNED` 返回封禁提示。

- [ ] **Step 2: 运行测试确认 RED**

运行：`pnpm exec vitest run src/features/auth/admin.test.ts src/features/auth/admin-actions.test.ts src/features/auth/actions.test.ts`

预期：因新接口和封禁状态映射不存在而失败。

- [ ] **Step 3: 实现最小服务端逻辑**

新增 `ManagedUser`、`UserStatusFilter` 和 `listUsers`；抽取 action 的 RPC 调用与错误映射，导出 `banUser`、`unbanUser`；登录门控优先返回“账号已被封禁，请联系管理员”。成功后刷新 `/admin`、`/` 和账户路径。

- [ ] **Step 4: 运行测试确认 GREEN**

运行：`pnpm exec vitest run src/features/auth/admin.test.ts src/features/auth/admin-actions.test.ts src/features/auth/actions.test.ts`

预期：全部通过。

### Task 3: 建立用户操作组件

**Files:**
- Create: `src/features/auth/components/user-management-actions.tsx`
- Create: `src/features/auth/components/user-management-actions.test.tsx`
- Reuse: `src/features/auth/components/review-buttons.tsx`

- [ ] **Step 1: 写组件失败测试**

覆盖待审核用户的通过/拒绝、已通过用户的封禁、已封禁用户的解封、管理员目标不显示封禁，以及封禁时调用 `window.confirm` 并在取消后不提交。

- [ ] **Step 2: 运行测试确认 RED**

运行：`pnpm exec vitest run src/features/auth/components/user-management-actions.test.tsx`

预期：因组件不存在而失败。

- [ ] **Step 3: 实现最小组件**

根据 `status` 和 `isAdmin` 组合现有 `ReviewButtons` 与封禁/解封表单。封禁按钮用明确的 destructive 样式和 `onSubmit` 确认文案，消息使用 `role="status"` 或 `role="alert"`。

- [ ] **Step 4: 运行测试确认 GREEN**

运行：`pnpm exec vitest run src/features/auth/components/user-management-actions.test.tsx src/features/auth/components/review-buttons.test.tsx`

预期：全部通过。

### Task 4: 重构用户管理页面与管理员入口

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/page.test.tsx`
- Modify: `src/app/me/page.tsx`
- Modify: `src/app/me/page.test.tsx`

- [ ] **Step 1: 写页面失败测试**

断言页面标题为“用户管理”，显示封禁影响说明、状态筛选、全部用户字段与操作；非法筛选回退全部；普通用户仍触发 404。“我的”页管理员入口改为“用户管理”，普通用户仍不显示。

- [ ] **Step 2: 运行测试确认 RED**

运行：`pnpm exec vitest run src/app/admin/page.test.tsx src/app/me/page.test.tsx`

预期：标题、说明、筛选和全用户查询断言失败。

- [ ] **Step 3: 实现最小页面结构**

页面读取 Promise 形式的 `searchParams`，规范化状态后调用 `listUsers`；渲染常驻说明、链接式筛选、状态标签和用户字段，复用 `AccountSubpageHeader`、`EmptyState` 与新的操作组件。入口标题和描述同步改为用户管理。

- [ ] **Step 4: 运行测试确认 GREEN**

运行：`pnpm exec vitest run src/app/admin/page.test.tsx src/app/me/page.test.tsx`

预期：全部通过。

### Task 5: 回归验证与提交

**Files:**
- Verify: all modified files

- [ ] **Step 1: 运行功能相关测试**

运行：`pnpm exec vitest run src/features/auth src/app/admin/page.test.tsx src/app/me/page.test.tsx src/features/posts/server/request-help-migration.test.ts`

预期：全部通过。

- [ ] **Step 2: 运行完整质量检查**

运行：`pnpm test:unit`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。

预期：全部以退出码 0 完成。

- [ ] **Step 3: 检查差异**

运行：`git diff --check` 和 `git status --short`，确认只包含用户管理、测试、迁移和文档改动。

- [ ] **Step 4: 中文提交并推送**

使用中文 Conventional Commit，例如 `feat: 增加用户管理与封禁能力`，推送当前 `main` 分支。

