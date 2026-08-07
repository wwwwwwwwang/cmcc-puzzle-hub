# 已拒绝用户重新审核实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 保留已拒绝用户账号，记录用户可见的拒绝原因，并允许管理员将账号恢复到待审核后重新审核。

**Architecture:** 通过 Supabase 迁移在数据库层约束状态流转和信用幂等；Server Action 只负责认证、输入校验、RPC 调用和缓存刷新；管理端在现有用户卡片内展开拒绝原因表单，登录页读取原因并展示。沿用现有 `useActionState`、RPC 和 `list_users` 分页模式，不新增删除或独立审核历史子系统。

**Tech Stack:** Next.js 16 App Router、React Server Actions、Supabase PostgreSQL RPC、Zod、Vitest、Playwright/GitHub Actions。

---

### Task 1: 数据库状态和拒绝原因迁移

**Files:**
- Create: `supabase/migrations/0011_rejected_user_review.sql`
- Test: `src/features/auth/rejected-review-migration.test.ts`

- [ ] **Step 1: 写迁移契约测试**

断言迁移包含 `rejection_reason`、`rejected_at`，回填旧 `REJECTED` 数据；`reject_user` 接收 `p_reason` 且只允许 `PENDING`；存在 `reopen_user_review`；`approve_user` 对非 `PENDING` 返回 `INVALID_STATUS`；恢复清空原因且不插入信用流水。

- [ ] **Step 2: 运行迁移测试确认失败**

运行：`pnpm vitest run src/features/auth/rejected-review-migration.test.ts`

预期：FAIL，当前不存在 `0011_rejected_user_review.sql`。

- [ ] **Step 3: 实现迁移**

新增字段和长度约束，回填旧拒绝用户。删除并重建当前六参数 `list_users` 函数，返回 `rejection_reason` 与 `rejected_at`。重建 `reject_user(p_target uuid, p_admin uuid, p_reason text)`：校验管理员、目标非管理员、原因 trim 后 1 至 200 字符、目标状态为 `PENDING`，然后写入 `REJECTED`、原因和时间。新增 `reopen_user_review(p_target, p_admin)`：只允许 `REJECTED`，改为 `PENDING` 并清空两个字段。重建 `approve_user` 仅允许 `PENDING`，成功时增加 3 点并写入 `SEED`；`APPROVED` 返回 `ALREADY_APPROVED`，其他状态返回 `INVALID_STATUS`。

- [ ] **Step 4: 运行迁移契约测试**

运行：`pnpm vitest run src/features/auth/rejected-review-migration.test.ts`

预期：PASS。

- [ ] **Step 5: 提交数据库变更**

```bash
git add supabase/migrations/0011_rejected_user_review.sql src/features/auth/rejected-review-migration.test.ts
git commit -m "feat: 增加拒绝用户重新审核迁移"
```

### Task 2: Server Action 和登录原因

**Files:**
- Modify: `src/features/auth/admin-actions.ts`
- Modify: `src/features/auth/actions.ts`
- Test: `src/features/auth/admin-actions.test.ts`
- Test: `src/features/auth/actions.test.ts`

- [ ] **Step 1: 写 action 失败测试**

增加 `rejectUser` 空原因、超长原因不调用 RPC；合法原因调用 `reject_user` 时携带 `p_reason`；`reopenUserReview` 调用 `reopen_user_review` 并返回“已恢复待审核”；登录 mock 返回 `REJECTED` 和原因时展示该原因，缺失原因时展示通用提示。

- [ ] **Step 2: 运行相关测试确认失败**

运行：`pnpm vitest run src/features/auth/admin-actions.test.ts src/features/auth/actions.test.ts`

预期：FAIL，当前 action 没有原因参数、恢复 action 和登录原因查询。

- [ ] **Step 3: 实现 Server Action**

在 `admin-actions.ts` 中增加 `reopenUserReview`，复用管理员会话校验、RPC 状态映射和 `/admin`、`/me`、`/` 刷新。将 `rejectUser` 改为读取 `reason`，trim 后校验 1 至 200 字符，再调用 `reject_user`。在 `actions.ts` 的登录 profile 查询中读取 `status,rejection_reason`，拒绝时退出会话并返回包含原因的中文提示。

- [ ] **Step 4: 运行相关测试确认通过**

运行：`pnpm vitest run src/features/auth/admin-actions.test.ts src/features/auth/actions.test.ts`

预期：PASS。

### Task 3: 管理端拒绝和恢复交互

**Files:**
- Modify: `src/features/auth/components/review-buttons.tsx`
- Modify: `src/features/auth/components/user-management-actions.tsx`
- Modify: `src/features/auth/admin.ts`
- Modify: `src/app/admin/page.tsx`
- Test: `src/features/auth/components/review-buttons.test.tsx`
- Test: `src/features/auth/components/user-management-actions.test.tsx`
- Test: `src/app/admin/page.test.tsx`

- [ ] **Step 1: 写组件失败测试**

断言待审核用户点击“拒绝”后出现原因输入、说明文字、确认和取消；取消不提交；原因必填且最长 200 字符。已拒绝用户显示原因和“恢复待审核”，管理员账号不显示任何状态操作。管理页将 RPC 返回的 `rejection_reason` 映射到用户模型。

- [ ] **Step 2: 运行相关测试确认失败**

运行：`pnpm vitest run src/features/auth/components/review-buttons.test.tsx src/features/auth/components/user-management-actions.test.tsx src/app/admin/page.test.tsx`

预期：FAIL，当前只有直接拒绝/通过按钮，用户模型没有拒绝原因。

- [ ] **Step 3: 实现行内交互**

沿用 `PasswordSetControl` 的展开模式。`ReviewButtons` 使用本地 `open` 状态，拒绝按钮打开行内表单；表单包含 `reason` 文本域、`maxLength={200}`、用户可见提示、取消按钮和提交按钮，提交使用新的 `rejectUser` action。`UserManagementActions` 对 `REJECTED` 渲染原因和 `reopenUserReview` 表单，对 `PENDING` 保留通过/拒绝，对其他状态保留封禁/解封。扩展 `ManagedUser` 和 `listUsers` 映射字段，页面传入并展示原因。

- [ ] **Step 4: 运行组件和管理页测试确认通过**

运行：`pnpm vitest run src/features/auth/components/review-buttons.test.tsx src/features/auth/components/user-management-actions.test.tsx src/app/admin/page.test.tsx`

预期：PASS。

### Task 4: 回归测试与 E2E 适配

**Files:**
- Modify: `tests/e2e/hall-and-publish.spec.ts`（仅在现有二维码改造测试因页面文案变化时更新）
- Modify: `src/features/auth/components/*.test.tsx`（仅补充本功能断言）

- [ ] **Step 1: 运行完整单元测试、类型检查和 Lint**

运行：`pnpm test:unit`、`pnpm typecheck`、`pnpm lint`。

预期：全部通过且无新增警告。

- [ ] **Step 2: 运行生产构建**

运行：`pnpm build`。

预期：Next.js 生产构建成功，包含 `/admin`、`/login` 和所有既有路由。

- [ ] **Step 3: 本地尝试 E2E**

运行：`pnpm test:e2e`。

预期：本地 Web Server 正常时全部通过；若 3100 端口或 Next Server 启动失败，记录环境原因，不修改测试断言绕过失败。

- [ ] **Step 4: 检查工作区和差异**

运行：`git diff --check`、`git status --short`。

预期：无空白错误，只有本次迁移、登录、管理端和测试改动。

### Task 5: 提交推送并由 GitHub Actions 验证

- [ ] **Step 1: 提交中文实现提交**

```bash
git add supabase/migrations/0011_rejected_user_review.sql src/features/auth src/app/admin docs/superpowers/plans/2026-08-07-rejected-user-review.md
git commit -m "feat: 支持拒绝用户重新审核"
```

- [ ] **Step 2: 推送 `main`**

运行：`git push origin main`

预期：远端 `main` 更新成功，触发 Actions。

- [ ] **Step 3: 查看 Actions E2E**

运行：`gh run list --limit 5`，然后对最新运行执行 `gh run watch <run-id> --exit-status`。

预期：单元测试、类型检查、构建和 E2E job 均成功；失败时先读取 job 日志并修复实际问题，再重新提交推送。

- [ ] **Step 4: 告知迁移步骤**

向用户说明必须在 Supabase SQL Editor 执行 `supabase/migrations/0011_rejected_user_review.sql`，再在线验证：拒绝填写原因、登录显示原因、恢复待审核、再次通过只增加一次 3 点信用。
