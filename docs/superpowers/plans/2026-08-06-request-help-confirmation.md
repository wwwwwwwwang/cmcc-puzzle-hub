# 求助助力确认与信用托管 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为求助帖实现发布时信用托管、助力后待确认、主动/自动确认结算、未收到重新开放，并新增“我帮助的”账户页面与轻量轮询刷新。

**Architecture:** Supabase Postgres 继续作为状态和信用的唯一真相源；新增独立助力记录表和 `SECURITY DEFINER` 原子函数，帖子状态只表达业务阶段，完成方式单独记录。求助助力通过独立 Route Handler 返回载荷，发布者确认与拒绝通过 Server Actions 执行；账户页保持 Server Components，客户端仅承担倒计时、30 秒轮询和手动 `router.refresh()`。

**Tech Stack:** Next.js 16.3 App Router、React 19、TypeScript、Supabase PostgreSQL/RLS/pg_cron、Tailwind CSS 4、Lucide React、Vitest、React Testing Library、Playwright

**Execution constraint:** 按用户要求直接在当前 `main` 工作区执行，不创建 worktree；每个任务完成验证后使用中文 Conventional Commit 提交。

---

## 文件结构

- Create: `supabase/migrations/0005_request_help_confirmation.sql`：状态、助力记录、信用托管、RLS、原子函数和定时维护。
- Create: `src/features/posts/server/request-help.integration.test.ts`：真实测试 Supabase 上的并发、结算、退款和权限测试。
- Modify: `src/features/posts/domain/types.ts`：补充求助状态和助力 DTO。
- Modify: `src/features/posts/server/post-repository.ts`：新增助力、确认、拒绝和活动同步 RPC 映射。
- Modify: `src/features/posts/server/post-repository.test.ts`：验证 RPC 参数和状态映射。
- Create: `src/app/api/posts/[id]/help/route.ts`：B 助力求助帖并获取载荷。
- Create: `src/app/api/posts/[id]/help/route.test.ts`：鉴权、限流和错误码测试。
- Modify: `src/app/api/posts/route.ts`：映射求助发布信用不足。
- Modify: `src/app/api/posts/route.test.ts`：验证 402 且不返回帖子。
- Modify: `src/app/api/posts/[id]/claim/route.ts`：保持赠送领取边界并映射 `INVALID_POST_TYPE`。
- Modify: `src/app/api/posts/[id]/claim/route.test.ts`：验证求助帖不能走领取路径。
- Modify: `src/features/posts/components/claim-drawer.tsx`：根据帖子类型调用领取或助力接口。
- Modify: `src/features/posts/components/claim-drawer.test.tsx`：验证请求路径、成功文案和错误分支。
- Modify: `src/features/posts/server/actions.ts`：新增确认收到和未收到 Server Actions。
- Modify: `src/features/posts/server/actions.test.ts`：验证会话、参数、RPC 状态和页面刷新。
- Modify: `src/features/posts/server/user-queries.ts`：拆分领取记录、助力记录、待处理数量和活动版本查询。
- Create: `src/features/posts/components/request-help-actions.tsx`：确认收到、未收到及二次确认交互。
- Create: `src/features/posts/components/request-help-actions.test.tsx`：验证 action 状态和二次确认。
- Create: `src/features/posts/components/confirmation-countdown.tsx`：待确认倒计时。
- Create: `src/features/posts/components/confirmation-countdown.test.tsx`：验证截止时间展示。
- Create: `src/features/posts/components/helped-payload-actions.tsx`：再次复制口令、唤起 App 或打开白名单链接。
- Create: `src/features/posts/components/helped-payload-actions.test.tsx`：验证剪贴板、跳转白名单和错误状态。
- Create: `src/features/posts/components/account-activity-refresh.tsx`：30 秒轮询、焦点刷新和手动刷新。
- Create: `src/features/posts/components/account-activity-refresh.test.tsx`：验证可见性、请求合并和错误保留。
- Create: `src/app/api/me/activity/route.ts`：返回账户活动数量和版本，不返回载荷。
- Create: `src/app/api/me/activity/route.test.ts`：验证鉴权、响应字段和 `no-store`。
- Modify: `src/features/account/components/account-subpage-header.tsx`：允许页头注入刷新操作。
- Modify: `src/features/account/components/account-subpage-header.test.tsx`：验证操作区。
- Modify: `src/app/me/page.tsx`：新增“我帮助的”和待确认徽标，更新信用说明。
- Modify: `src/app/me/page.test.tsx`：验证普通用户三个入口、管理员第四入口和徽标。
- Modify: `src/app/me/posts/page.tsx`：展示求助状态、倒计时及确认操作。
- Modify: `src/app/me/posts/page.test.tsx`：覆盖等待助力、待确认、完成方式和退款结束。
- Modify: `src/app/me/claimed/page.tsx`：仅展示赠送领取记录。
- Modify: `src/app/me/claimed/page.test.tsx`：验证求助记录不进入领取页。
- Create: `src/app/me/helped/page.tsx`：新增“我帮助的”页面。
- Create: `src/app/me/helped/page.test.tsx`：覆盖等待确认、完成和未收到状态。
- Modify: `src/features/posts/components/post-status-label.ts`：补充求助状态与完成方式标签。
- Modify: `tests/e2e/hall-and-publish.spec.ts`：验证求助使用独立助力接口且赠送流程不回归。
- Modify: `README.md`：更新信用规则、页面入口和定时任务部署说明。
- Modify: `CLAUDE.md`：更新项目架构事实和核心不变量。
- Modify: `docs/零预算部署与开源指南.md`：补充迁移及 Supabase Cron 配置。

### Task 1: 建立求助助力数据库模型

**Files:**
- Create: `supabase/migrations/0005_request_help_confirmation.sql`
- Create: `src/features/posts/server/request-help.integration.test.ts`

- [ ] **Step 1: 编写数据库集成测试骨架和第一个失败用例**

测试只在 `TEST_SUPABASE_URL`、`TEST_SUPABASE_SERVICE_ROLE_KEY` 和 `TEST_SUPABASE_ANON_KEY` 均存在时运行；缺失时 `describe.skip`，绝不连接生产变量。创建三个临时 Auth 用户 A/B/C，并通过 service role 将档案设为 `APPROVED`、信用设为确定值。

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && serviceKey && process.env.TEST_SUPABASE_ANON_KEY);

describe.skipIf(!enabled)("request help RPC", () => {
  let admin: SupabaseClient;
  const userIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("发布求助时扣除并托管 1 点", async () => {
    const requester = await createApprovedUser(admin, userIds, 2);
    const { data } = await admin.rpc("publish_post", requestArgs(requester.id));
    expect(data.status).toBe("CREATED");

    const [{ data: profile }, { data: post }] = await Promise.all([
      admin.from("profiles").select("credits").eq("id", requester.id).single(),
      admin.from("posts").select("request_credit_status").eq("id", data.post.id).single(),
    ]);
    expect(profile?.credits).toBe(1);
    expect(post?.request_credit_status).toBe("HELD");
  });
});
```

同文件定义 `createApprovedUser()` 和 `requestArgs()`，所有 payload 使用随机 UUID，避免测试间去重冲突。

- [ ] **Step 2: 在已配置测试 Supabase 且尚未应用迁移时运行，确认失败**

Run: `pnpm test:integration -- src/features/posts/server/request-help.integration.test.ts`

Expected: 配置测试凭证时 FAIL，提示 `request_credit_status` 或新 RPC 不存在；未配置时明确显示 skipped。

- [ ] **Step 3: 编写迁移中的表结构与约束**

在 `0005_request_help_confirmation.sql` 中执行以下结构变更：

```sql
alter table public.posts drop constraint posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (status in ('OPEN', 'CLAIMED', 'PENDING_CONFIRM', 'COMPLETED', 'EXPIRED'));

alter table public.posts
  add column request_credit_status text
    check (request_credit_status in ('HELD', 'SETTLED', 'REFUNDED')),
  add column closure_reason text
    check (closure_reason in ('DELISTED', 'TIMEOUT')),
  add column updated_at timestamptz not null default now();

alter table public.posts add constraint posts_request_credit_shape check (
  (type = 'GIVE' and request_credit_status is null)
  or (type = 'REQUEST' and request_credit_status is not null)
);

create table public.request_help_attempts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  helper_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('PENDING', 'REJECTED', 'COMPLETED')),
  helped_at timestamptz not null default now(),
  confirmation_deadline timestamptz not null,
  resolved_at timestamptz,
  confirmation_method text check (confirmation_method in ('MANUAL', 'AUTO')),
  unique (post_id, helper_id),
  check (
    (status = 'COMPLETED' and resolved_at is not null and confirmation_method is not null)
    or (status = 'REJECTED' and resolved_at is not null and confirmation_method is null)
    or (status = 'PENDING' and resolved_at is null and confirmation_method is null)
  )
);

create unique index request_help_one_pending_per_post
  on public.request_help_attempts(post_id) where status = 'PENDING';
create index request_help_helper_history
  on public.request_help_attempts(helper_id, helped_at desc);
create index request_help_due
  on public.request_help_attempts(confirmation_deadline) where status = 'PENDING';
```

扩展 `credit_ledger_reason_check`，保留原有原因并加入 `ESCROW_REQUEST`、`EARN_HELP_CONFIRMED`、`REFUND_REQUEST`。

- [ ] **Step 4: 收紧 RLS 并保护助力记录**

删除宽泛的 `posts_select_authenticated`，改为仅允许发布者、赠送领取者或存在助力记录的用户读取帖子；大厅继续只走 `list_hall_posts` 安全 RPC。启用 `request_help_attempts` RLS，发布者可读自己帖子的记录，助力者可读自己的记录，客户端不具备写策略。

不能让 `posts` policy 直接查询受 RLS 保护的 `request_help_attempts`，同时又让 attempts policy 查询 posts，否则会形成递归 RLS。先创建两个 `stable security definer` 布尔函数，并固定 `search_path = public`：

```sql
create or replace function public.can_read_post(p_post_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (
        p.publisher_id = auth.uid()
        or p.claimant_id = auth.uid()
        or exists (
          select 1 from public.request_help_attempts a
          where a.post_id = p.id and a.helper_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_read_help_attempt(p_attempt_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.request_help_attempts a
    join public.posts p on p.id = a.post_id
    where a.id = p_attempt_id
      and (a.helper_id = auth.uid() or p.publisher_id = auth.uid())
  );
$$;

revoke all on function public.can_read_post(uuid) from public;
revoke all on function public.can_read_help_attempt(uuid) from public;
grant execute on function public.can_read_post(uuid) to authenticated;
grant execute on function public.can_read_help_attempt(uuid) to authenticated;

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_related on public.posts for select using (
  public.can_read_post(id)
);

alter table public.request_help_attempts enable row level security;
create policy request_help_select_related on public.request_help_attempts
for select using (
  public.can_read_help_attempt(id)
);
```

- [ ] **Step 5: 替换发布和赠送领取函数的类型边界**

更新 `publish_post`：`REQUEST` 发布前锁定 A 档案并校验余额；创建帖子、写去重键、扣 1 点和写 `ESCROW_REQUEST` 必须处于同一事务。余额不足返回 `INSUFFICIENT_CREDITS`，重复内容仍返回 `DUPLICATE_POST` 且不扣分。

更新 `claim_post`：锁帖后若 `v_post.type <> 'GIVE'`，立即返回 `INVALID_POST_TYPE`；其余赠送领取、扣分、奖励和幂等逻辑保持不变。

- [ ] **Step 6: 实现助力、确认、拒绝和维护 RPC**

在迁移中新增以下签名并逐一 `revoke` 公共执行权限，仅向 `authenticated` 授予前三个业务函数，维护函数仅允许 `service_role`/数据库定时任务执行：

```sql
public.help_request_post(p_post_id uuid, p_helper uuid) returns jsonb
public.resolve_request_help(p_post_id uuid, p_publisher uuid, p_received boolean) returns jsonb
public.sync_request_maintenance() returns jsonb
```

返回状态固定为：

```text
help_request_post:
HELPED / SELF_HELP_FORBIDDEN / ALREADY_HELPED / HELP_RETRY_FORBIDDEN / EXPIRED / INVALID_POST_TYPE

resolve_request_help:
COMPLETED / REOPENED / EXPIRED / FORBIDDEN / NOT_PENDING
```

`help_request_post` 使用 `FOR UPDATE` 锁帖，创建 `PENDING` 记录并设置 `confirmation_deadline = now() + interval '24 hours'`，将帖子改为 `PENDING_CONFIRM` 后返回 payloads。若同一 B 的记录已是 `PENDING`，幂等返回同一 payloads；若为 `REJECTED/COMPLETED`，返回 `HELP_RETRY_FORBIDDEN`。

`resolve_request_help(..., true)` 将助力和帖子改为完成、托管改为 `SETTLED`、B `+1` 并写流水；`false` 将助力改为拒绝，原帖未过期则重新 `OPEN`，已过期则退款并结束。

`sync_request_maintenance()` 使用 `FOR UPDATE SKIP LOCKED` 处理到期 `PENDING` 助力和过期 `OPEN` 求助，自动完成记录写 `AUTO`，过期未助力求助写 `REFUND_REQUEST`。完成或退款时删除对应 `active_payload_hashes`；未收到且重新开放时保留去重键。同步更新 `delist_post`：GIVE 保持现有行为，REQUEST 仅允许 `OPEN` 时原子退款并标记 `EXPIRED/DELISTED`。维护函数同时调用或合并原 `cleanup_expired_posts()` 的赠送过期清理。

- [ ] **Step 7: 扩充集成测试覆盖核心不变量**

在同一测试文件增加：余额不足发布不扣分、并发 B/C 只有一个助力成功、主动确认单次结算、重复确认幂等、未收到重新开放、原 B 禁止再次助力、过期拒绝退款、无人助力到期退款、自动确认、赠送领取不回归、越权解析失败。

并发断言使用：

```ts
const results = await Promise.all([
  admin.rpc("help_request_post", { p_post_id: postId, p_helper: helperB.id }),
  admin.rpc("help_request_post", { p_post_id: postId, p_helper: helperC.id }),
]);
expect(results.map(({ data }) => data.status).sort()).toEqual([
  "ALREADY_HELPED",
  "HELPED",
]);
```

- [ ] **Step 8: 应用迁移到专用测试 Supabase 并运行集成测试**

在 Supabase SQL Editor 对测试项目执行 `0005_request_help_confirmation.sql`，然后运行：

Run: `pnpm test:integration -- src/features/posts/server/request-help.integration.test.ts`

Expected: PASS；所有临时 Auth 用户在 `afterAll` 被删除。不得使用生产 Supabase 执行该测试。

- [ ] **Step 9: 提交数据库模型与集成测试**

```bash
git add supabase/migrations/0005_request_help_confirmation.sql src/features/posts/server/request-help.integration.test.ts
git commit -m "feat: 建立求助助力与信用托管事务"
```

### Task 2: 扩展仓储层和求助助力接口

**Files:**
- Modify: `src/features/posts/domain/types.ts`
- Modify: `src/features/posts/server/post-repository.ts`
- Modify: `src/features/posts/server/post-repository.test.ts`
- Create: `src/app/api/posts/[id]/help/route.ts`
- Create: `src/app/api/posts/[id]/help/route.test.ts`
- Modify: `src/app/api/posts/[id]/claim/route.ts`
- Modify: `src/app/api/posts/[id]/claim/route.test.ts`
- Modify: `src/app/api/posts/route.ts`
- Modify: `src/app/api/posts/route.test.ts`

- [ ] **Step 1: 编写仓储层失败测试**

增加 `helpRequestPost()`、`resolveRequestHelp()` 和 `syncRequestMaintenance()` 的 RPC 参数与状态映射测试，并补充 `publishPost()` 映射 `INSUFFICIENT_CREDITS`。

```ts
it("调用 help_request_post 并映射 HELPED", async () => {
  rpc.mockResolvedValue({
    data: {
      status: "HELPED",
      idempotent: false,
      payloads: { command: "￥help￥" },
      confirmationDeadline: "2026-08-07T00:00:00.000Z",
    },
    error: null,
  });

  await expect(helpRequestPost("post", "helper", { client })).resolves.toEqual({
    status: "HELPED",
    idempotent: false,
    payloads: { command: "￥help￥" },
    confirmationDeadline: "2026-08-07T00:00:00.000Z",
  });
  expect(rpc).toHaveBeenCalledWith("help_request_post", {
    p_post_id: "post",
    p_helper: "helper",
  });
});
```

- [ ] **Step 2: 运行仓储层测试确认失败**

Run: `pnpm exec vitest run src/features/posts/server/post-repository.test.ts`

Expected: FAIL，提示新导出或状态类型不存在。

- [ ] **Step 3: 实现领域类型和仓储映射**

新增类型：

```ts
export type RequestPostStatus = "OPEN" | "PENDING_CONFIRM" | "COMPLETED" | "EXPIRED";
export type HelpAttemptStatus = "PENDING" | "REJECTED" | "COMPLETED";
export type ConfirmationMethod = "MANUAL" | "AUTO";
```

仓储函数只返回白名单状态，未知响应抛出“RPC 返回异常”，不能把任意数据库字符串透传到 UI。

- [ ] **Step 4: 编写求助 API 失败测试**

覆盖 UUID 校验、未审核用户 401、限流 429、成功 `no-store`、自助 403、已被助力 409、不可重试 409、过期 404、错误服务 503。

```ts
it("成功助力返回载荷和确认截止时间", async () => {
  getApprovedUser.mockResolvedValue({ id: "helper" });
  checkClaimRateLimit.mockResolvedValue({ success: true });
  helpRequestPost.mockResolvedValue({
    status: "HELPED",
    idempotent: false,
    payloads: { command: "￥help￥" },
    confirmationDeadline: "2026-08-07T00:00:00.000Z",
  });

  const response = await POST(request, { params: Promise.resolve({ id: POST_ID }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
```

- [ ] **Step 5: 运行求助 API 测试确认失败**

Run: `pnpm exec vitest run src/app/api/posts/[id]/help/route.test.ts`

Expected: FAIL，提示 Route Handler 不存在。

- [ ] **Step 6: 实现求助 Route Handler**

复用现有领取限流与 UUID 校验，调用 `helpRequestPost(id, user.id)`。错误映射：`SELF_HELP_FORBIDDEN`→403、`ALREADY_HELPED/HELP_RETRY_FORBIDDEN`→409、`EXPIRED`→404、`INVALID_POST_TYPE`→400；成功只返回 payloads、idempotent、confirmationDeadline。

同时让现有 claim route 映射 `INVALID_POST_TYPE` 为 400，保证攻击者不能通过领取接口让 REQUEST 走旧扣分逻辑；发布 route 将 `publishPost()` 的 `INSUFFICIENT_CREDITS` 映射为 402。

- [ ] **Step 7: 运行仓储和两个 Route Handler 测试**

Run: `pnpm exec vitest run src/features/posts/server/post-repository.test.ts src/app/api/posts/route.test.ts src/app/api/posts/[id]/help/route.test.ts src/app/api/posts/[id]/claim/route.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交仓储和接口**

```bash
git add src/features/posts/domain/types.ts src/features/posts/server/post-repository.ts src/features/posts/server/post-repository.test.ts src/app/api/posts/route.ts src/app/api/posts/route.test.ts src/app/api/posts/[id]/help/route.ts src/app/api/posts/[id]/help/route.test.ts src/app/api/posts/[id]/claim/route.ts src/app/api/posts/[id]/claim/route.test.ts
git commit -m "feat: 添加求助助力接口"
```

### Task 3: 将大厅求助切换到独立助力流程

**Files:**
- Modify: `src/features/posts/components/claim-drawer.tsx`
- Modify: `src/features/posts/components/claim-drawer.test.tsx`
- Modify: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 编写组件失败测试**

为 REQUEST 帖断言请求 `/help`，GIVE 仍请求 `/claim`；助力成功后显示“助力已提交，等待对方确认”，复制失败改用链接时不重复创建助力记录。

```ts
it("求助帖调用独立助力接口", async () => {
  const fetchSpy = vi.fn(async () => helpResponse({ command: "￥help￥" }));
  vi.stubGlobal("fetch", fetchSpy);
  renderDrawer({ ...commandPost, type: "REQUEST" });

  fireEvent.click(screen.getByRole("button", { name: "使用口令助力" }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
    `/api/posts/${commandPost.id}/help`,
    expect.objectContaining({ method: "POST" }),
  ));
  expect(await screen.findByText("助力已提交，等待对方确认")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行组件测试确认失败**

Run: `pnpm exec vitest run src/features/posts/components/claim-drawer.test.tsx`

Expected: FAIL，当前 REQUEST 仍请求 `/claim`。

- [ ] **Step 3: 实现按帖子类型选择接口和成功状态**

将请求 URL 收敛为：

```ts
const endpoint = post.type === "GIVE"
  ? `/api/posts/${post.id}/claim`
  : `/api/posts/${post.id}/help`;
```

保留“先持久化，再复制/跳转”的顺序。REQUEST 成功后展示等待确认提示和进入“我帮助的”链接；`ALREADY_HELPED` 从大厅移除，`HELP_RETRY_FORBIDDEN` 保留明确错误。

- [ ] **Step 4: 更新 E2E API mock 和请求断言**

在 `installApiMocks` 中分别计数 `claim` 与 `help`。新增用例：求助发布后点击“使用口令助力”只调用 `/help` 一次，赠送用例继续只调用 `/claim`。

- [ ] **Step 5: 运行组件和定向 E2E**

Run: `pnpm exec vitest run src/features/posts/components/claim-drawer.test.tsx`

Expected: PASS。

Run: `pnpm test:e2e -- --grep "求助|领取保持"`

Expected: 所有匹配用例在三个移动项目通过。

- [ ] **Step 6: 提交大厅助力流程**

```bash
git add src/features/posts/components/claim-drawer.tsx src/features/posts/components/claim-drawer.test.tsx tests/e2e/hall-and-publish.spec.ts
git commit -m "feat: 分离求助助力与赠送领取流程"
```

### Task 4: 添加发布者确认与未收到操作

**Files:**
- Modify: `src/features/posts/server/actions.ts`
- Modify: `src/features/posts/server/actions.test.ts`
- Create: `src/features/posts/components/request-help-actions.tsx`
- Create: `src/features/posts/components/request-help-actions.test.tsx`

- [ ] **Step 1: 编写 Server Actions 失败测试**

覆盖未登录、非法 postId、成功确认、重新开放、过期退款、越权和服务异常。成功后必须 `revalidatePath("/me")`、`/me/posts` 和 `/me/helped`。

```ts
it("确认收到后刷新三个账户路径", async () => {
  getCurrentUser.mockResolvedValue({ id: "publisher" });
  resolveRequestHelp.mockResolvedValue({ status: "COMPLETED" });

  const form = new FormData();
  form.set("postId", POST_ID);
  await expect(confirmReceived({}, form)).resolves.toEqual({ success: "已确认收到" });
  expect(resolveRequestHelp).toHaveBeenCalledWith(POST_ID, "publisher", true);
  expect(revalidatePath).toHaveBeenCalledWith("/me/posts");
});
```

- [ ] **Step 2: 运行 actions 测试确认失败**

Run: `pnpm exec vitest run src/features/posts/server/actions.test.ts`

Expected: FAIL，提示确认与拒绝 action 不存在。

- [ ] **Step 3: 实现两个 Server Actions**

新增 `confirmReceived` 和 `reportNotReceived`，始终从会话获取用户 ID，只接受 UUID `postId`。按 RPC 状态返回中文消息，未知状态统一失败。依据 Next.js 16.3 文档，Server Actions 是可直接 POST 的安全边界，必须在 action 内认证并依赖 RPC 再次校验发布者归属。

- [ ] **Step 4: 编写操作组件失败测试**

验证“确认已收到”直接提交；“未收到”先调用 `window.confirm("确认未收到拼图？帖子将重新开放。")`，取消时不提交，确认时提交；pending 时两个按钮均禁用。

- [ ] **Step 5: 运行组件测试确认失败**

Run: `pnpm exec vitest run src/features/posts/components/request-help-actions.test.tsx`

Expected: FAIL，提示组件不存在。

- [ ] **Step 6: 实现操作组件**

使用两个独立 `useActionState` 表单；按钮分别使用 `Check` 和 `XCircle` 图标。错误信息占满一行，避免移动端挤压。组件不自行修改信用或帖子状态。

- [ ] **Step 7: 运行 actions 与组件测试**

Run: `pnpm exec vitest run src/features/posts/server/actions.test.ts src/features/posts/components/request-help-actions.test.tsx`

Expected: PASS。

- [ ] **Step 8: 提交确认操作**

```bash
git add src/features/posts/server/actions.ts src/features/posts/server/actions.test.ts src/features/posts/components/request-help-actions.tsx src/features/posts/components/request-help-actions.test.tsx
git commit -m "feat: 添加求助收货确认操作"
```

### Task 5: 拆分账户查询并新增“我帮助的”页面

**Files:**
- Modify: `src/features/posts/server/user-queries.ts`
- Modify: `src/features/posts/components/post-status-label.ts`
- Create: `src/features/posts/components/confirmation-countdown.tsx`
- Create: `src/features/posts/components/confirmation-countdown.test.tsx`
- Create: `src/features/posts/components/helped-payload-actions.tsx`
- Create: `src/features/posts/components/helped-payload-actions.test.tsx`
- Modify: `src/app/me/posts/page.tsx`
- Modify: `src/app/me/posts/page.test.tsx`
- Modify: `src/app/me/claimed/page.tsx`
- Modify: `src/app/me/claimed/page.test.tsx`
- Create: `src/app/me/helped/page.tsx`
- Create: `src/app/me/helped/page.test.tsx`

- [ ] **Step 1: 编写查询映射和页面失败测试**

`getMyClaimedPosts()` 必须增加 `.eq("type", "GIVE")`；新增 `getMyHelpedPosts()` 返回帖子载荷、助力状态、截止时间、完成方式；`getMyPosts()` 返回待确认信息、托管状态和结束原因。

页面测试覆盖：

```ts
expect(screen.getByText("等待你确认")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "确认已收到" })).toBeInTheDocument();
expect(screen.getByText("24 小时后自动确认")).toBeInTheDocument();
expect(screen.getByText("对方未收到，本次助力未完成")).toBeInTheDocument();
```

- [ ] **Step 2: 运行三个页面测试确认失败**

Run: `pnpm exec vitest run src/app/me/posts/page.test.tsx src/app/me/claimed/page.test.tsx src/app/me/helped/page.test.tsx`

Expected: FAIL，新增页面/状态尚不存在。

- [ ] **Step 3: 实现查询 DTO 和映射**

新增：

```ts
export type MyHelpedPost = {
  attemptId: string;
  postId: string;
  discount: Discount;
  pieceNumber: number;
  payloads: PostSources;
  status: HelpAttemptStatus;
  confirmationDeadline: string;
  confirmationMethod: ConfirmationMethod | null;
  helpedAt: string;
  resolvedAt: string | null;
};
```

查询只使用当前用户会话客户端和 RLS，不使用 service role。所有页面继续 `dynamic = "force-dynamic"`，不增加应用层缓存。

- [ ] **Step 4: 实现倒计时组件**

组件接收 ISO 截止时间，每秒更新剩余时分秒；到期显示“等待系统自动确认”，但不在客户端执行结算。

```tsx
<time dateTime={deadline} aria-label="自动确认倒计时">
  {remainingMs > 0 ? `剩余 ${formatDuration(remainingMs)}` : "等待系统自动确认"}
</time>
```

- [ ] **Step 5: 重构“我的帖子”状态卡片**

GIVE 沿用现有状态；REQUEST：`OPEN` 显示等待助力和下架，`PENDING_CONFIRM` 显示倒计时与 `RequestHelpActions`，`COMPLETED` 显示主动/自动确认，`EXPIRED` 根据 closure reason 显示已过期或已下架。

- [ ] **Step 6: 实现历史助力载荷操作**

`HelpedPayloadActions` 接收 `PostSources`，口令按钮先写剪贴板再唤起 `leadeon://`，链接按钮必须再次经过 `parseUrl()` 白名单校验后导航。复制失败时展示口令和重试按钮，不调用自定义 Scheme；双来源切换不得产生任何助力 API 请求。

- [ ] **Step 7: 限定“我领取的”并实现“我帮助的”**

“我领取的”只渲染 GIVE。`/me/helped` 使用 `AccountSubpageHeader` 和 `EmptyState`，按助力时间倒序展示 `PENDING/COMPLETED/REJECTED`，并使用 `HelpedPayloadActions` 再次使用口令或链接；REJECTED 保留历史内容但不出现“再次助力”入口。

- [ ] **Step 8: 运行页面、倒计时和载荷操作测试**

Run: `pnpm exec vitest run src/features/posts/components/confirmation-countdown.test.tsx src/features/posts/components/helped-payload-actions.test.tsx src/app/me/posts/page.test.tsx src/app/me/claimed/page.test.tsx src/app/me/helped/page.test.tsx`

Expected: PASS。

- [ ] **Step 9: 提交账户记录分流**

```bash
git add src/features/posts/server/user-queries.ts src/features/posts/components/post-status-label.ts src/features/posts/components/confirmation-countdown.tsx src/features/posts/components/confirmation-countdown.test.tsx src/features/posts/components/helped-payload-actions.tsx src/features/posts/components/helped-payload-actions.test.tsx src/app/me/posts/page.tsx src/app/me/posts/page.test.tsx src/app/me/claimed/page.tsx src/app/me/claimed/page.test.tsx src/app/me/helped/page.tsx src/app/me/helped/page.test.tsx
git commit -m "feat: 新增我帮助的并完善求助状态"
```

### Task 6: 添加账户入口、待处理徽标和刷新机制

**Files:**
- Modify: `src/features/account/components/account-subpage-header.tsx`
- Modify: `src/features/account/components/account-subpage-header.test.tsx`
- Create: `src/app/api/me/activity/route.ts`
- Create: `src/app/api/me/activity/route.test.ts`
- Create: `src/features/posts/components/account-activity-refresh.tsx`
- Create: `src/features/posts/components/account-activity-refresh.test.tsx`
- Modify: `src/app/me/page.tsx`
- Modify: `src/app/me/page.test.tsx`
- Modify: `src/app/me/posts/page.tsx`
- Modify: `src/app/me/helped/page.tsx`

- [ ] **Step 1: 编写活动接口和页头操作区失败测试**

活动接口响应固定为：

```ts
type AccountActivity = {
  pendingConfirmationCount: number;
  pendingHelpCount: number;
  version: string;
};
```

未登录返回 401；成功响应带 `Cache-Control: no-store`，不得包含 payloads。页头测试验证传入 `actions` 时展示刷新按钮区域。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/app/api/me/activity/route.test.ts src/features/account/components/account-subpage-header.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现账户活动查询和 Route Handler**

`getAccountActivity()` 只查询当前用户相关的待确认数量和 `max(updated_at/resolved_at)`，必要时先调用幂等维护 RPC 校正到期状态。GET Route Handler 因读取会话和数据库天然动态，显式返回 `no-store`。

- [ ] **Step 4: 编写轮询组件失败测试**

使用 fake timers 验证：存在 pending 时 30 秒请求；无 pending 不定时请求；`document.hidden` 时停止；`visibilitychange`/`focus` 时立即检查；手动刷新合并重复请求；版本变化调用 `router.refresh()`；失败显示非阻塞提示且下一轮可重试。

- [ ] **Step 5: 实现轮询和手动刷新**

组件使用 `AbortController` 与 `inFlightRef`，不得同时发出两个活动请求。依据 Next.js 16.3 `useRouter` 文档，`router.refresh()` 会合并新的 RSC payload 并保留滚动位置和未受影响的客户端状态。

刷新按钮只显示 `RefreshCw` 图标并提供 `aria-label="刷新状态"` 与 title；请求中旋转并禁用。

- [ ] **Step 6: 更新“我的”入口和徽标**

普通用户入口改为“我的帖子”“我领取的”“我帮助的”；管理员额外显示“用户审核”。“我的帖子”显示 `pendingConfirmationCount` 徽标。信用说明改为“领取赠送消耗 1 点；发布求助托管 1 点；帮助成功可获得 1 点”。

`REASON_LABELS` 增加三种新流水中文名称。

- [ ] **Step 7: 将刷新组件接入两个相关页面**

`/me/posts` 和 `/me/helped` 的页头 actions 中放入 `AccountActivityRefresh`。只有页面数据包含待确认记录时启用轮询，手动刷新始终可用。

- [ ] **Step 8: 运行刷新与账户页测试**

Run: `pnpm exec vitest run src/app/api/me/activity/route.test.ts src/features/account/components/account-subpage-header.test.tsx src/features/posts/components/account-activity-refresh.test.tsx src/app/me/page.test.tsx src/app/me/posts/page.test.tsx src/app/me/helped/page.test.tsx`

Expected: PASS。

- [ ] **Step 9: 提交账户活动刷新**

```bash
git add src/features/account/components/account-subpage-header.tsx src/features/account/components/account-subpage-header.test.tsx src/app/api/me/activity/route.ts src/app/api/me/activity/route.test.ts src/features/posts/components/account-activity-refresh.tsx src/features/posts/components/account-activity-refresh.test.tsx src/app/me/page.tsx src/app/me/page.test.tsx src/app/me/posts/page.tsx src/app/me/helped/page.tsx
git commit -m "feat: 添加助力入口与待处理刷新"
```

### Task 7: 配置定时维护并更新运维文档

**Files:**
- Modify: `supabase/migrations/0005_request_help_confirmation.sql`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/零预算部署与开源指南.md`

- [ ] **Step 1: 在迁移末尾配置 Supabase Cron**

启用 `pg_cron`，用稳定任务名避免重复注册：

```sql
create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('cmcc-request-help-maintenance');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'cmcc-request-help-maintenance',
  '*/5 * * * *',
  'select public.sync_request_maintenance()'
);
```

在测试项目和生产项目分别执行迁移后，用以下 SQL 验证任务存在：

```sql
select jobname, schedule, command, active
from cron.job
where jobname = 'cmcc-request-help-maintenance';
```

- [ ] **Step 2: 更新 README 与项目事实文档**

删除“求助帖不参与信用”，改为托管规则；补充三个普通用户入口、主动/自动确认、未收到重新开放和 Cron 5 分钟维护窗口。`CLAUDE.md` 的核心不变量同步为 GIVE 立即结算、REQUEST 托管结算两条路径。

- [ ] **Step 3: 更新零预算部署指南**

新增 `0005` 执行顺序、Database → Extensions 启用 pg_cron、Cron 查询验证、手动调用 `select public.sync_request_maintenance();` 的故障排查步骤。明确生产维护函数不暴露为公共 HTTP 接口。

- [ ] **Step 4: 检查文档一致性**

Run: `rg -n "求助帖不参与信用|领取一次消耗 1 点|cleanup_expired_posts|0001.*0004" README.md CLAUDE.md docs/零预算部署与开源指南.md`

Expected: 不再存在与新规则冲突的描述；迁移顺序包含 `0005`。

- [ ] **Step 5: 提交定时维护与文档**

```bash
git add supabase/migrations/0005_request_help_confirmation.sql README.md CLAUDE.md docs/零预算部署与开源指南.md
git commit -m "docs: 补充求助托管与定时维护说明"
```

### Task 8: 全量回归、视觉检查和线上迁移准备

**Files:**
- Modify as required by failures only; do not perform unrelated refactors.

- [ ] **Step 1: 运行格式检查和全部单元测试**

Run: `git diff --check`

Expected: 无输出，exit 0。

Run: `pnpm test:unit`

Expected: 全部测试通过，无未处理 Promise 或 React act 警告。

- [ ] **Step 2: 运行类型、Lint 和构建**

Run: `pnpm typecheck`

Expected: exit 0。

Run: `pnpm lint`

Expected: exit 0。

Run: `pnpm build`

Expected: Next.js 16.3 构建成功，`/me/helped`、`/api/me/activity` 和 `/api/posts/[id]/help` 出现在路由输出中。

- [ ] **Step 3: 运行集成测试**

Run: `pnpm test:integration`

Expected: 配置专用测试 Supabase 时全部通过；未配置时明确 skipped，不得连接生产项目。

- [ ] **Step 4: 运行完整 E2E**

Run: `pnpm test:e2e`

Expected: 三个移动视口全部通过；求助只调用 `/help`，赠送只调用 `/claim`，外部 CMCC 请求不携带 E2E 测试认证信息。

- [ ] **Step 5: 启动开发服务器并进行浏览器视觉验证**

Run: `pnpm dev`

在可用端口打开：`/`、`/me`、`/me/posts`、`/me/claimed`、`/me/helped`。使用 375×667、390×844、430×932 和桌面窄列检查：

- 三/四个账户入口不挤压、不溢出。
- 待确认卡片按钮可换行且不重叠。
- 刷新图标有可访问名称、loading 状态不改变布局。
- 长口令和长链接正常换行。
- 倒计时更新不引起卡片宽高跳动。
- 页面不存在横向滚动。

- [ ] **Step 6: 进行独立代码审查**

使用 `requesting-code-review` 技能审查 `3966c76..HEAD`，优先检查信用重复结算、RLS 载荷泄露、自动确认竞争、轮询泄漏和赠送流程回归。修复所有阻断性发现后重新运行受影响测试及 Step 1-4。

- [ ] **Step 7: 提交最终测试或修复**

仅在 Step 1-6 产生必要修改时提交：

```bash
git add <仅本轮修复文件>
git commit -m "test: 完善求助确认流程回归验证"
```

- [ ] **Step 8: 部署前数据库检查**

在生产 Supabase SQL Editor 执行 `0005_request_help_confirmation.sql` 前确认线上无旧 REQUEST 数据；执行后检查表约束、RPC grants 和 `cron.job`。随后部署应用，避免新应用先于数据库结构上线。

- [ ] **Step 9: 线上冒烟验收**

使用三个已审核测试账号验证：A 发布求助并托管 1 点；B 助力；A 确认后 B +1；A 对另一条求助选择未收到后 C 可以助力且 B 不能重试。确认 `/me/claimed` 不显示求助，`/me/helped` 状态正确，Actions 和 Vercel 部署均为绿色。
