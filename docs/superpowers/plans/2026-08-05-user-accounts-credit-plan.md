# 用户账号与「赠一领一」信用制实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 [用户账号与信用制设计](../specs/2026-08-05-user-accounts-credit-design.md) 落地:引入 Supabase 邮箱+密码账号,将帖子/领取/信用迁到 Postgres,以「GIVE 帖被别人领取 +1、领取 -1」约束数量,并提供用户自管理。Redis 退回纯限流。

**已确认参数:** 登录=邮箱+密码;种子信用=1;求助(REQUEST)帖不参与信用;每日发布=10、领取=10、赚取封顶=5;共享 IP/设备的领取不给发布者加分。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Zod、Supabase(Auth + Postgres + RLS + plpgsql)、`@supabase/ssr`、`@supabase/supabase-js`、Upstash Redis(限流)、Vitest、Testing Library、Playwright、pnpm。

**人工交接点(我无法代做,需你在控制台/本地完成):**
- 在 Supabase 创建项目,拿到 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。
- 在 Supabase SQL Editor(或 `supabase db push`)执行 `supabase/migrations/` 下的迁移。
- 配置 Auth:开启 Email provider;开发期可关闭邮箱验证以便测试。
- 集成测试需要一个测试用 Postgres(本地 `supabase start` 或专用测试项目)提供连接串。

---

### Task 1: 依赖与环境变量

**Files:**
- Modify: `package.json`(经 `pnpm add`)
- Modify: `.env.example`
- Modify: `README.md`、`CLAUDE.md`(补充 Supabase 环境说明)

- [ ] **Step 1:** `pnpm add @supabase/supabase-js @supabase/ssr`。
- [ ] **Step 2:** `.env.example` 增加 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`,并补充信用/上限相关可选变量(`SEED_CREDITS=1`、`PUBLISH_LIMIT_PER_DAY=10`、`CLAIM_LIMIT_PER_DAY=10`、`EARN_CAP_PER_DAY=5`)。
- [ ] **Step 3:** README 与 CLAUDE.md 增补 Supabase 配置与「Redis 仅限流」的新架构说明。

**Verify:** `pnpm install` 成功;`pnpm typecheck` 不因缺类型报错。

---

### Task 2: 数据库表结构迁移

**Files:**
- Create: `supabase/migrations/0001_init_accounts_posts_credits.sql`

- [ ] **Step 1:** 建 `profiles`(`id uuid pk references auth.users`, `public_id text unique`, `credits int not null default 0 check(credits>=0)`, `created_at timestamptz default now()`)。
- [ ] **Step 2:** 建 `posts`(`id uuid pk default gen_random_uuid()`, `publisher_id uuid references profiles`, `type text check in (GIVE,REQUEST)`, `discount smallint`, `piece_number smallint`, `payloads jsonb`, `available_payload_kinds text[]`, `status text default 'OPEN' check in (OPEN,CLAIMED,EXPIRED)`, `claimant_id uuid`, `created_at timestamptz default now()`, `expires_at timestamptz not null`, `claimed_at timestamptz`)。加 `(created_at desc, id desc)`、`(type, discount, status)`、`(publisher_id)`、`(claimant_id)`、`(expires_at)` 索引。
- [ ] **Step 3:** 建 `active_payload_hashes`(`hash text primary key`, `post_id uuid references posts on delete cascade`)。
- [ ] **Step 4:** 建 `credit_ledger`(`id bigserial pk`, `user_id uuid references profiles`, `delta int`, `reason text`, `post_id uuid`, `created_at timestamptz default now()`),`(user_id, created_at desc)` 索引。

**Verify:** 在 Supabase SQL Editor 执行无错;`\d` 结构符合预期。

---

### Task 3: 行级安全(RLS)策略

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`

- [ ] **Step 1:** 四表 `enable row level security`。
- [ ] **Step 2:** `profiles`:本人可 `select`;禁止客户端 `update credits`(仅 `SECURITY DEFINER` 函数改)。
- [ ] **Step 3:** `posts`:登录用户可 `select` 大厅所需列(**不含 `payloads`**,用视图或列级授权/受限视图 `hall_posts` 暴露安全列);`payloads` 仅通过函数返回给发布者/领取者;`insert`/`update`/`delete` 仅经函数。
- [ ] **Step 4:** `active_payload_hashes` 客户端不可直接读写;`credit_ledger` 本人只读、任何人不可改。

**Verify:** 用 anon key 直连尝试 `select payloads` / `update credits` 均被拒;用受限视图能读到大厅安全列。

---

### Task 4: 原子数据库函数(核心不变量)

**Files:**
- Create: `supabase/migrations/0003_functions.sql`

- [ ] **Step 1:** `handle_new_user()` 触发器:`auth.users` 插入后建 `profiles` 行,`public_id` = `'U-'||upper(substr(replace(id::text,'-',''),1,16))`,`credits = :seed`(默认 1,由函数参数或 GUC 传入)。
- [ ] **Step 2:** `publish_post(publisher, type, discount, piece, payloads jsonb, kinds, hashes text[], expires_at, publish_count_ok bool)` `SECURITY DEFINER`:同事务校验发布上限(上限判断在应用层限流,DB 侧只做去重与插入)、逐一 `insert active_payload_hashes` 命中唯一冲突则整体回滚返回 `DUPLICATE_POST`、插入 `posts`,返回帖子安全字段。
- [ ] **Step 3:** `claim_post(post_id, claimant, claimant_ip, claimant_device_hash, allow_earn bool)` `SECURITY DEFINER`:`SELECT ... FOR UPDATE` 锁帖;按设计校验(OPEN/未过期/未领/非自领/余额≥1);幂等分支;扣领取人 1 分写流水;`type='GIVE'` 且 `allow_earn` 时发布者 +1(受当日封顶,超限则不加)写流水;置 `CLAIMED`;删 `active_payload_hashes`;返回 `payloads` + 状态。失败返回明确状态并回滚。
- [ ] **Step 4:** `delist_post(post_id, owner)`:仅本人且 `status=OPEN` 可删帖 + 删去重行,返回结果。
- [ ] **Step 5:** `cleanup_expired_posts()`:将过期 OPEN 帖置 `EXPIRED` 并清去重行(供 Cron 调用)。

**Verify:** SQL Editor 手工调用各函数覆盖成功/各失败分支;并发领取(两连接同帖)仅一个 `CLAIMED`。

---

### Task 5: Supabase 客户端封装与会话中间件

**Files:**
- Create: `src/lib/supabase/server.ts`(基于 cookies 的 server client)
- Create: `src/lib/supabase/browser.ts`(browser client)
- Create: `src/lib/supabase/admin.ts`(service role,`server-only`,仅供 Server Action 调 RPC)
- Create: `src/middleware.ts`(`@supabase/ssr` 刷新会话)

- [ ] **Step 1:** 按 `node_modules/@supabase/ssr` 与 Next 16 文档实现三种 client;`admin.ts` 顶部 `import "server-only"`,校验 `SUPABASE_SERVICE_ROLE_KEY` 存在。
- [ ] **Step 2:** middleware 刷新会话并保护需要登录的路由(发布页、自管理页、写 API)。

**Verify:** `pnpm typecheck`;本地登录后会话在刷新后保持。

---

### Task 6: 登录/注册页与认证 Server Actions

**Files:**
- Create: `src/app/(auth)/login/page.tsx`、`src/app/(auth)/register/page.tsx`
- Create: `src/features/auth/actions.ts`(`signIn`/`signUp`/`signOut` Server Actions)
- Create: 对应 `*.test.tsx` / `*.test.ts`
- Modify: `src/components/bottom-nav.tsx`、`src/components/app-shell.tsx`(登录态入口/退出)

- [ ] **Step 1:** 用 Zod 校验邮箱/密码(密码 min 8);Server Action 调 `supabase.auth.signInWithPassword` / `signUp`;错误映射为用户友好中文文案,不泄露账号是否存在。
- [ ] **Step 2:** 注册成功后 `profiles` 由触发器自动建行(种子信用 1);页面显示当前 `publicId` 与余额。
- [ ] **Step 3:** 导航增加登录/退出入口;未登录访问受保护页重定向到 `/login`。

**Verify:** 单测覆盖校验与错误分支;e2e 注册→登录→退出通过。

---

### Task 7: 改造仓储层与 API 路由(调用 RPC + 要求登录)

**Files:**
- Modify: `src/features/posts/server/post-repository.ts`(改为调用 Supabase RPC;删除 Redis 帖子/索引/回执逻辑)
- Modify: `src/app/api/posts/route.ts`、`src/app/api/posts/[id]/claim/route.ts`(从会话取 userId,拒绝未登录)
- Modify: `src/features/posts/domain/schemas.ts`、`schemas.test.ts`(领取输入不再依赖 visitorId 作身份;visitorId 降级为可选反刷信号)
- Delete/Retire: `src/features/posts/server/claim-script.ts`、`keys.ts`(zset 部分)、`PUBLISH_POST_SCRIPT`、`normalizeStoredPost` 旧结构分支及相关测试
- Modify: 相关 `*.test.ts`

- [ ] **Step 1:** `post-repository` 暴露 `publishPost/listPosts/claimPost/delistPost`,内部走 `admin` client `.rpc(...)`;`listPosts` 用 keyset 游标查 `hall_posts` 视图。
- [ ] **Step 2:** API 路由改为:未登录返回 401;发布/领取前查会话 userId,传给 RPC;保留 DomainError→400、统一错误信封与 `Cache-Control: no-store`。
- [ ] **Step 3:** 删除退役的 Redis 帖子逻辑与旧兼容分支及测试,更新仓储/路由测试改用 Supabase mock。

**Verify:** `pnpm typecheck`、单测通过;集成测试(见 Task 10)覆盖 RPC。

---

### Task 8: 发布/领取每日限流(Redis 保留角色)

**Files:**
- Modify: `src/features/posts/server/rate-limit.ts`(新增每用户每日发布/领取限流器)
- Modify: `src/app/api/posts/route.ts`、`claim/route.ts`
- Modify: `rate-limit.test.ts`

- [ ] **Step 1:** 新增 `checkClaimRateLimit(userId, ip)`、`checkDailyPublishLimit(userId)`,滑动/固定窗口 1 天,上限来自 env。
- [ ] **Step 2:** 领取前先过限流再进 RPC;超限返回 429 + `Retry-After`。`allow_earn` 由「领取人与发布者不同 IP/deviceHash + 未超当日封顶」决定,传入 `claim_post`。

**Verify:** 单测覆盖放行/拦截;超限返回 429。

---

### Task 9: 用户自管理页面

**Files:**
- Create: `src/app/me/page.tsx`(信用概览 + 最近流水)
- Create: `src/app/me/posts/page.tsx`(我的帖子 + 下架)
- Create: `src/app/me/claimed/page.tsx`(我领取的 + payloads)
- Create: `src/features/posts/server/user-queries.ts`(按 userId 查询,受 RLS 保护)
- Create: 对应组件与 `*.test.tsx`

- [ ] **Step 1:** 「我的帖子」列出状态,OPEN 帖可调 `delist_post` 下架(Server Action)。
- [ ] **Step 2:** 「我领取的」展示 payloads,复用现有复制/唤起组件。
- [ ] **Step 3:** 「信用概览」读 `credit_ledger`。

**Verify:** 单测覆盖列表/下架/空态;e2e 覆盖下架流程。

---

### Task 10: 测试与文档收尾

**Files:**
- Modify: `vitest.integration.config.ts`、集成测试(改为针对测试 Postgres)
- Modify: `tests/e2e/*`、新增账号/信用 e2e
- Modify: `README.md`、`docs/零预算部署与开源指南.md`、`CLAUDE.md`

- [ ] **Step 1:** 集成测试改为连接测试 Supabase Postgres;覆盖 `claim_post` 并发单一赢家、幂等、余额不足、禁止自领、过期、封顶不加分;`publish_post` 去重。无凭证 `describe.skip`。
- [ ] **Step 2:** e2e:注册→发布 GIVE→他账号领取(-1/+1)→余额 0 被拒→自管理下架;保留二维码不上传断言。
- [ ] **Step 3:** 更新三份文档:新架构、环境变量、部署步骤、防刷定位与限制说明。
- [ ] **Step 4:** 全量校验:lint、typecheck、test:unit、(有凭证)test:integration、build、test:e2e。

**Verify:** CI 全绿。
