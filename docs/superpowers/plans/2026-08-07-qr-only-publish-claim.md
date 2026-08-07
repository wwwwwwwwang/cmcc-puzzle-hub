# 仅二维码发布与永久去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除口令发布/领取链路，强制使用二维码，并以二维码业务凭证做永久去重，防止同一拼图拆成多帖。

**Architecture:** 浏览器只负责本地解析二维码；领域层把白名单 URL 解析为帖子类型、规范化业务身份和 URL 载荷。API 将身份摘要传给 Supabase RPC；新迁移增加永久身份登记表，RPC 在同一事务内完成登记、帖子创建和信用变动。活跃摘要表继续保留用于现有帖子生命周期清理，但不再是永久去重的最终依据。

**Tech Stack:** Next.js App Router Route Handlers、React Client Components、Zod、Vitest、Playwright、Supabase PostgreSQL RPC/迁移。

---

### Task 1: 增加二维码规范化身份

**Files:**
- Modify: `src/features/posts/domain/types.ts`
- Modify: `src/features/posts/domain/parse-url.ts`
- Modify: `src/features/posts/domain/parse-command.ts`
- Modify: `src/features/posts/domain/parse-source.ts`
- Test: `src/features/posts/domain/parse-url.test.ts`
- Test: `src/features/posts/domain/parse-source.test.ts`

- [ ] **Step 1: 写失败测试**

为真实赠送/求助 URL 增加断言：解析结果包含 `identity`，且只改变外层渠道参数、查询参数顺序或求助 `phone` 时 identity 不变；业务 token 或活动路径变化时 identity 改变。为过渡期口令解析结果断言 `identity: null`，后续任务再删除口令代码。

```ts
expect(parseUrl(GIVE_URL).identity).toMatch(/^GIVE:/);
expect(parseUrl(withTrackingParam(GIVE_URL)).identity).toBe(parseUrl(GIVE_URL).identity);
expect(parseCommand(GIVE_COMMAND).identity).toBeNull();
```

- [ ] **Step 2: 运行领域测试确认失败**

运行：`pnpm vitest run src/features/posts/domain/parse-url.test.ts src/features/posts/domain/parse-command.test.ts src/features/posts/domain/parse-source.test.ts src/features/posts/domain/parse-sources.test.ts`

预期：新增 identity 断言因字段不存在而失败。

- [ ] **Step 3: 实现最小领域改动**

在 `ParsedSource`/`ParsedSources` 中增加 `identity: string | null`；`parseUrl` 解码外层 `targetUrl`，读取活动路径与唯一 `giveCard`/`requestCard`，生成 `<type>:<path>:<token>`。忽略 `pageId`、`channelId`、`sellerId`、查询顺序和 `phone`。过渡期 `parseCommand` 返回 `identity: null`，`parseSources` 优先返回 URL identity，保持现有双来源调用方可编译。

- [ ] **Step 4: 运行测试确认通过**

运行同 Step 2，预期所有新增领域断言通过。

- [ ] **Step 5: 提交领域变更**

```powershell
git add src/features/posts/domain
git commit -m "refactor: 收敛拼图来源为二维码"
```

### Task 2: 发布页只保留二维码输入

**Files:**
- Modify: `src/features/posts/components/publish-panel.tsx`
- Modify: `src/features/posts/components/publish-panel.test.tsx`
- Modify: `src/app/publish/page.test.tsx`

- [ ] **Step 1: 写失败组件测试**

断言发布页不存在口令输入、标签页和“清除口令”，二维码控件存在；未识别二维码时发布按钮禁用；识别成功时请求体只包含 `sources: { url }`。

- [ ] **Step 2: 运行组件测试确认失败**

运行：`pnpm vitest run src/features/posts/components/publish-panel.test.tsx src/app/publish/page.test.tsx`

- [ ] **Step 3: 实现 UI**

删除 command state、Tabs、Textarea 和口令相关预览；保留 `QrImagePicker`、清除链接、类型校验和登录跳转。错误映射将 `SELECTION_MISMATCH` 改为二维码/拼图不一致，`DUPLICATE_POST` 改为“该二维码对应的拼图已经发布过了”。提交请求固定发送：

```ts
const input: CreatePostInput = {
  type: postType,
  selection,
  sources: { url: qrUrl.trim() },
};
```

- [ ] **Step 4: 运行组件测试确认通过**

运行同 Step 2，预期 PASS。

- [ ] **Step 5: 提交发布页变更**

```powershell
git add src/features/posts/components/publish-panel.tsx src/features/posts/components/publish-panel.test.tsx src/app/publish/page.test.tsx
git commit -m "feat: 发布页仅支持二维码"
```

### Task 3: API、仓储和永久身份登记迁移

**Files:**
- Modify: `src/app/api/posts/route.ts`
- Modify: `src/features/posts/domain/schemas.ts`
- Modify: `src/features/posts/server/post-repository.ts`
- Create: `supabase/migrations/0010_permanent_puzzle_identity.sql`
- Test: `src/app/api/posts/route.test.ts`
- Test: `src/features/posts/domain/schemas.test.ts`
- Test: `src/features/posts/server/post-repository.test.ts`
- Test: `src/features/posts/server/request-help.integration.test.ts`（仅更新发布 RPC 参数）

- [ ] **Step 1: 写失败 API/仓储测试**

断言 Schema 要求 `sources.url` 必填并拒绝 `sources.command`；发布请求只计算规范化 identity 的 SHA-256；仓储 RPC 收到 `p_kinds: ["URL"]`、单个 identity hash 和 `{ url }`；响应中的 payloads 只包含 URL。增加历史 identity 冲突映射为 `DUPLICATE_POST` 的测试。

- [ ] **Step 2: 运行测试确认失败**

运行：`pnpm vitest run src/features/posts/domain/schemas.test.ts src/app/api/posts/route.test.ts src/features/posts/server/post-repository.test.ts`

- [ ] **Step 3: 实现 API/仓储**

`createPostInputSchema` 改为严格的 `{ sources: { url } }`。API 使用 `parseSources(input.sources, input.selection)`，确认 `parsed.identity` 非空后通过 `sha256(parsed.identity)` 生成唯一摘要，不再分别哈希 command/url。保留现有 Route Handler 的 `Request`/`Response` 语义和 `no-store` 响应头。仓储发布参数固定为 URL，但公共领取载荷类型到 Task 5 再统一收窄，避免中间提交破坏账户页面。

- [ ] **Step 4: 编写 SQL 迁移**

在 `0010_permanent_puzzle_identity.sql` 中创建：

```sql
create table if not exists public.puzzle_identity_registry (
  identity_hash text primary key,
  first_post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);
```

重定义 `publish_post`：校验 `p_kinds = ARRAY['URL']`、`p_payloads` 只含 URL；在同一事务插入帖子、永久登记、活跃摘要和求助信用流水。任一唯一约束冲突都回滚并返回 `DUPLICATE_POST`。领取、下架、过期、封禁函数继续删除 `active_payload_hashes`，不得删除 `puzzle_identity_registry`。授予 `service_role` 执行权限。

- [ ] **Step 5: 运行 API/仓储测试确认通过**

运行同 Step 2，并运行：`pnpm typecheck`。

- [ ] **Step 6: 提交服务端与迁移变更**

```powershell
git add src/app/api/posts/route.ts src/features/posts/server/post-repository.ts src/app/api/posts/route.test.ts src/features/posts/server/post-repository.test.ts src/features/posts/server/request-help.integration.test.ts supabase/migrations/0010_permanent_puzzle_identity.sql
git commit -m "feat: 增加二维码永久去重"
```

### Task 4: 领取、助力和账户页面移除口令入口

**Files:**
- Modify: `src/features/posts/components/claim-drawer.tsx`
- Modify: `src/features/posts/components/helped-payload-actions.tsx`
- Modify: `src/features/posts/components/post-card.tsx`
- Modify: `src/app/me/claimed/page.tsx`
- Modify: `src/app/me/helped/page.tsx`
- Modify: `src/features/posts/server/user-queries.ts`
- Test: 对应 `claim-drawer.test.tsx`、`helped-payload-actions.test.tsx`、`post-card.test.tsx`、`claimed/page.test.tsx`、`helped/page.test.tsx`

- [ ] **Step 1: 写失败测试**

断言卡片来源文案固定为“二维码”；领取抽屉只显示“打开链接领取/助力”；API 响应缺少 URL 时视为无效；已领取和已帮助页面只展示安全白名单 URL，不渲染 command。

- [ ] **Step 2: 运行相关测试确认失败**

运行：`pnpm vitest run src/features/posts/components/claim-drawer.test.tsx src/features/posts/components/helped-payload-actions.test.tsx src/features/posts/components/post-card.test.tsx src/app/me/claimed/page.test.tsx src/app/me/helped/page.test.tsx`

- [ ] **Step 3: 实现 URL-only 领取流程**

删除 command 分支、剪贴板、`leadeon://`、方式选择和 fallback；保留 `parseUrl` 二次校验后导航。收窄响应解析为 `{ payloads: { url: string }, idempotent }`，并继续支持同一次领取后的重试入口。

- [ ] **Step 4: 运行相关测试确认通过**

运行同 Step 2，预期 PASS。

- [ ] **Step 5: 提交领取与账户页面变更**

```powershell
git add src/features/posts/components/claim-drawer.tsx src/features/posts/components/helped-payload-actions.tsx src/features/posts/components/post-card.tsx src/app/me/claimed/page.tsx src/app/me/helped/page.tsx src/features/posts/server/user-queries.ts
git commit -m "refactor: 领取流程仅使用二维码链接"
```

### Task 5: 清理旧口令领域文件和测试夹具

**Files:**
- Delete: `src/features/posts/domain/parse-command.ts`
- Delete: `src/features/posts/domain/parse-command.test.ts`
- Modify: `src/features/posts/domain/parse-source.ts`
- Modify: `src/features/posts/domain/parse-source.test.ts`
- Modify: `tests/fixtures/cmcc-samples.ts`
- Modify: `src/app/api/posts/route.test.ts`, `src/app/me/claimed/page.test.tsx`, `src/app/me/helped/page.test.tsx`, `src/app/me/page.test.tsx`, `src/app/publish/page.tsx`, `src/features/posts/components/claim-drawer.test.tsx`, `src/features/posts/components/helped-payload-actions.test.tsx`, `src/features/posts/components/post-card.test.tsx`, `src/features/posts/components/post-feed.test.tsx`, `src/features/posts/components/publish-panel.test.tsx`, `src/features/posts/domain/parse-source.test.ts`, `src/features/posts/domain/parse-sources.test.ts`, `src/features/posts/server/post-repository.test.ts`, `src/features/posts/server/request-help.integration.test.ts`, `src/features/posts/server/user-queries.test.ts`

- [ ] **Step 1: 全局搜索残留**

运行：`rg -n "parseCommand|GIVE_COMMAND|REQUEST_COMMAND|COMMAND|口令|leadeon" src tests supabase`，仅保留历史迁移注释或明确不执行的兼容字段。

- [ ] **Step 2: 删除无调用代码并改写断言**

移除无法到达的口令解析器与测试，测试夹具只保留 URL；更新来源类型、文案和模拟响应。

- [ ] **Step 3: 运行完整单元测试**

运行：`pnpm test:unit`，预期全部通过。

- [ ] **Step 4: 提交清理变更**

```powershell
git add src tests
git commit -m "chore: 清理口令发布领取代码"
```

### Task 6: 更新 E2E 流程

**Files:**
- Modify: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 将 E2E 固定为二维码流程**

删除口令标签和口令领取按钮断言；使用 `give-url-qr.png` 完成赠送发布、领取、求助发布和助力确认。

- [ ] **Step 2: 增加重复二维码场景**

第二次提交同一二维码，断言响应 409、错误文案正确，并确认不会产生第二条帖子。

- [ ] **Step 3: 运行 E2E**

运行：`pnpm test:e2e`，若本地缺少 Supabase 环境则记录为环境阻塞，不修改测试绕过。

- [ ] **Step 4: 提交 E2E 变更**

```powershell
git add tests/e2e
git commit -m "test: 覆盖二维码发布领取流程"
```

### Task 7: 最终验证与迁移交付

**Files:**
- Verify only: 工作区全部相关文件

- [ ] **Step 1: 运行验证命令**

```powershell
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

- [ ] **Step 2: 检查迁移说明**

向用户交付 `supabase/migrations/0010_permanent_puzzle_identity.sql`，说明需在 Supabase SQL Editor 执行；执行后再运行线上冒烟验证。

- [ ] **Step 3: 检查工作区和提交历史**

运行：`git status --short`、`git log -6 --oneline`，确保没有未提交源码改动。
