# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> 上面的 `@AGENTS.md` 由 `next dev` 自动写入,提醒本仓库使用较新的 Next.js(16.3.0),其 API/约定可能与训练数据不同——写 Next 相关代码前先查 `node_modules/next/dist/docs/`。

## 项目概览

移动端优先的「周三充值日拼图互助」H5:用户发布口令(command)或二维码链接(url)来赠送/求助拼图,他人以最少步骤领取(复制口令唤起中国移动 APP,或跳转白名单链接)。

**架构(2026-08 起):** Supabase Postgres 是数据真相源(账号、信用、帖子、领取、求助助力与确认),Upstash Redis 退回**只做限流**。GIVE 领取时立即结算；REQUEST 发布时托管 1 点，助力后由发布者主动确认或 24 小时自动确认，再给助力者 +1。设计/计划见 `docs/superpowers/specs|plans/2026-08-06-request-help-confirmation*.md`。

**账号与审核(微信群场景):** 用**用户名+密码**登录(不用邮箱;内部用 `用户名归一化后的 SHA-256@puzzle.internal` 合成邮箱喂 Supabase Auth,用户永不接触邮箱,见 `src/features/auth/username.ts`)。注册后 `status=PENDING`、**种子信用不发**;登录时未审核即登出并提示"改群昵称与用户名一致后 @管理员"。管理员在 `/admin` 审核(核对用户名 vs 群昵称),通过才发信用、才能发布/领取。真正的反 Sybil 靠**微信群+人工审核**,不是设备指纹(已弃用);IP 仅做注册限流 + /admin 同 IP 标黄。**首个管理员需在 Supabase 手动 `update profiles set is_admin=true`。** 迁移 `0004` 含 username/status/is_admin + approve/reject/list_pending 函数。

## 常用命令

环境:Node 22、pnpm 10。包管理器锁定为 `pnpm@10.32.1`。

```powershell
pnpm dev                      # 本地开发 (localhost:3000)
pnpm lint                     # eslint .
pnpm typecheck                # next typegen && tsc --noEmit(改类型/路由后必跑)
pnpm test:unit                # vitest 单测(jsdom,排除 integration/e2e)
pnpm test:integration         # 连接专用 Upstash 的集成测试
pnpm test:e2e                 # Playwright(Chromium + WebKit 移动流程)
pnpm build
```

- 跑单个单测:`pnpm vitest run src/features/posts/domain/parse-command.test.ts`,或按名称 `pnpm vitest run -t "并发"`。
- **集成测试需要 `TEST_UPSTASH_REDIS_REST_URL` / `TEST_UPSTASH_REDIS_REST_TOKEN`**;未配置时用 `describe.skip` 明确跳过,绝不连生产 Redis。测试间用 `TEST_REDIS_PREFIX` 隔离键空间。
- 提交前的完整校验顺序见 CI(`.github/workflows/ci.yml`):lint → typecheck → test:unit →(有凭证才)test:integration → build → test:e2e。

## 架构大图

### 分层(`src/features/posts/`)

- `domain/` — 纯函数:口令/URL 解析(`parse-command`、`parse-url`、`parse-source(s)`)、Zod 校验(`schemas.ts`)、类型(`types.ts`)、`DomainError`。**无副作用**,客户端与服务端共用。
- `server/` — 数据访问层,被 `server-only` 守护。`post-repository.ts` 调用 Supabase RPC(`publish_post`/`claim_post`/`help_request_post`/`resolve_request_help`/`delist_post`/`list_hall_posts`);`user-queries.ts` 用会话客户端读“我的帖子/我领取的/我帮助的/信用/账户活动”(RLS 保护);`server/actions.ts` 提供下架与求助确认 Server Actions;`rate-limit.ts` 是唯一保留的 Redis 用途。
- `src/lib/supabase/` — 三个客户端:`server.ts`(会话 Cookie,RLS 以用户身份生效,并含 `getCurrentUser`/`getAuthSession`)、`browser.ts`、`admin.ts`(service role,仅供 Server Action 调 RPC,`server-only`)。
- `src/features/auth/` — 邮箱密码登录:`actions.ts`(signIn/signUp/signOut Server Actions)、`schemas.ts`、`components/auth-form.tsx`、`auth-session.tsx`(客户端 `useAuthSession`,由 layout 注入 `{isAuthenticated, publicId}`)。
- 身份**全部**来自 Supabase 账号:客户端组件用 `useAuthSession()` 判断登录态与自己的 `publicId`。旧的匿名设备指纹(`visitorId`/`deviceHash`/`/api/identity`)**已整体移除**。
- `src/proxy.ts` — **Next 16 的 middleware 已改名 proxy**(见记忆),刷新 Supabase 会话并保护 `/publish`、`/me`。
- `src/app/` — App Router:大厅 `page.tsx`、`publish/`、`login/`、`register/`、`me/`(+`posts`/`claimed`/`helped`)、API 路由(`api/posts`、`api/posts/[id]/claim|help`、`api/me/activity`)。`me/*` 页面标 `export const dynamic = "force-dynamic"`;根 layout 读会话故整站按需渲染。
- `supabase/migrations/*.sql` — 表结构、RLS、plpgsql 函数(手动在 Supabase 执行)。

### 关键不变量(改动前务必理解)

1. **并发正确性 + 信用变动靠 plpgsql `SECURITY DEFINER` 函数的单事务,不靠应用层。** GIVE 由 `claim_post` 锁帖并立即结算；REQUEST 由 `publish_post` 托管、`help_request_post` 锁帖创建单个 PENDING 助力、`resolve_request_help` 主动确认/拒绝，`sync_request_maintenance` 自动确认和到期退款。任一失败整事务回滚；改这些 SQL 必须同步更新集成测试。
2. **信用规则。** 种子默认 1；领取 GIVE -1，GIVE 被他人领取给发布者 +1(受每日封顶;领取人与发布者注册 IP 相同则视为疑似同一人,由 `claim_post` 判定不加分)；发布 REQUEST -1 并记 `ESCROW_REQUEST`，助力确认后 B +1 并记 `EARN_HELP_CONFIRMED`，拒绝且已过期/无人助力到期则 A +1 并记 `REFUND_REQUEST`。被拒绝的 B 不能再次助力同帖。
3. **隐私边界。** 大厅只经 `list_hall_posts`/`hall_posts` 视图返回安全列(含 `publisher_public_id`),**绝不返回 `payloads`**;`payloads` 只由 `claim_post`/`help_request_post` 返回给参与者，或 `user-queries` 经 RLS 返回给相关本人。`/api/me/activity` 只返回计数和版本。二维码图片仅浏览器内经 Canvas+jsQR 解码,**绝不上传**(e2e 有断言)。
4. **RLS。** `profiles`、`posts`、`credit_ledger`、`active_payload_hashes`、`request_help_attempts` 全开 RLS；客户端无直接写策略；service-role 客户端只在服务端调用写 RPC，函数内再次校验用户归属。
5. **过期与自动确认。** Postgres 无 TTL；`expires_at` 保留原截止时间。Supabase Cron 每 5 分钟调用 `sync_request_maintenance()`，完成 24 小时自动确认、REQUEST 到期退款、GIVE 过期和去重清理。维护 RPC 仅授予 `service_role`。
6. **游标分页。** keyset `(created_at desc, id desc)`,游标编码 `{createdAt, id}` base64url;比较在 `list_hall_posts` SQL 内完成(不用 PostgREST `.or()` 拼时间戳)。
7. **双来源约束。** 口令与链接可单独或同时提供;客户端与服务端都解析并按白名单校验;双来源必须指向相同的 GIVE/REQUEST 类型。

### 防刷定位(诚实边界)

- **账号是唯一身份与信用主键;IP 是辅助信号。** 登录用用户名+密码(内部合成邮箱,无短信预算),**新建账号接近免费**,信用制挡的是顺手薅的普通用户,**挡不住铁心刷号者(Sybil)**。
- **发布**:每用户每小时(`PUBLISH_LIMIT_PER_HOUR`)+ 每日(`PUBLISH_LIMIT_PER_DAY`)双限流。
- **领取**:每用户 + 每 IP 每日限流(`CLAIM_LIMIT_PER_DAY`)+ 信用余额约束。上线仍建议在网关补边缘限流。

## 约定

- Redis 惰性初始化:`getRedis()` → `Redis.fromEnv()`,仅用于 `rate-limit.ts`;新服务端模块顶部加 `import "server-only"`。
- API 错误统一 `{ error: { code, message, field? } }`;写操作/领取响应带 `Cache-Control: no-store`;未登录写接口返回 401 `UNAUTHENTICATED`。
- 环境变量(`.env.example`):`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`DEVICE_HASH_SECRET`、信用/限流上限。切勿提交 `.env.local` 或任何密钥。
- 测试就近放置:单测 `*.test.ts(x)`(jsdom),集成 `*.integration.test.ts`(node 环境,针对测试 Postgres),e2e 在 `tests/e2e/`。
