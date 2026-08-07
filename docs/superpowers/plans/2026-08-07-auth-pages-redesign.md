# 登录与注册页 UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让登录和注册页复用首页、发布页和“我的”页的浅灰白底、蓝色主操作和轻量卡片视觉，同时保持现有认证行为。

**Architecture:** 页面层负责认证页的品牌标题、说明和卡片容器；`AuthForm` 继续负责 action 状态、字段和提交按钮，只补充可复用的表单视觉钩子。登录/注册页不新增认证逻辑，`redirect` 仍由页面读取并传递给 `AuthForm`。

**Tech Stack:** Next.js 16.3 App Router、React、Tailwind CSS、Vitest、Testing Library。

---

### Task 1: 阅读 Next.js 16 相关指南并建立测试基线

**Files:**
- Read: `node_modules/next/dist/docs/` 中与 App Router 页面、Server Components 和表单 action 相关的指南
- Test: `src/app/login/page.test.tsx`（若不存在则创建）
- Test: `src/app/register/page.test.tsx`（若不存在则创建）

- [ ] **Step 1: 阅读当前版本指南**

确认 `searchParams` Promise、Server Component 页面和 action 传给客户端表单的写法与当前代码一致；记录实现中不能使用的旧 API。

- [ ] **Step 2: 检查并补充登录页测试**

覆盖标题、用户名/密码字段、提交按钮、注册链接和 `redirect` 参数传递。测试应通过 `render(await LoginPage(...))` 检查页面真实可访问结构。

- [ ] **Step 3: 检查并补充注册页测试**

覆盖标题、用户名/密码字段、3 点信用审核提示、登录链接和 `redirect` 参数传递。

- [ ] **Step 4: 运行测试确认基线**

运行：`pnpm exec vitest run src/app/login/page.test.tsx src/app/register/page.test.tsx`

预期：现有行为测试通过；若新断言尚未对应视觉结构，应先以明确的断言失败作为 RED 状态。

### Task 2: 实现统一认证页视觉结构

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/register/page.tsx`
- Modify: `src/features/auth/components/auth-form.tsx`

- [ ] **Step 1: 为页面增加统一容器**

使用 `min-h-dvh`、浅灰背景、窄内容区和白色卡片；品牌区包含互助标识、标题和简短说明，登录/注册只替换文案。

- [ ] **Step 2: 优化注册提示信息层级**

把审核和信用规则放进浅蓝提示条，保留现有“审核通过即获得 3 点信用”事实，不改变文字含义或认证 action。

- [ ] **Step 3: 调整 AuthForm 样式与状态展示**

保持现有字段名称、`autoComplete`、`aria-invalid`、`role=alert` 和 action；增加卡片内部间距、输入框高度、聚焦态和错误提示的稳定布局，提交按钮继续在 pending 时禁用并显示“处理中…”。

- [ ] **Step 4: 保持链接参数兼容**

登录到注册、注册到登录的链接继续按当前方式编码 `redirect`，无参数时不生成多余查询字符串。

### Task 3: 回归验证与清理

**Files:**
- Modify: `src/app/login/page.test.tsx`
- Modify: `src/app/register/page.test.tsx`

- [ ] **Step 1: 运行认证页测试**

运行：`pnpm exec vitest run src/app/login/page.test.tsx src/app/register/page.test.tsx src/features/auth`

预期：全部通过，且错误状态断言验证的是用户可见的提示和可访问属性。

- [ ] **Step 2: 运行全量单测、类型检查和 lint**

运行：`pnpm test:unit`、`pnpm typecheck`、`pnpm lint`。

预期：全部通过，无新增 TypeScript 或 ESLint 警告。

- [ ] **Step 3: 运行生产构建**

运行：`pnpm build`。

预期：Next.js 16.3 构建成功，登录和注册路由均被编译。

- [ ] **Step 4: 检查差异并提交**

运行：`git diff --check` 和 `git status --short`，确认只包含认证页、测试和计划相关文件，然后使用中文 Conventional Commit 提交。
