# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> 上面的 `@AGENTS.md` 由 `next dev` 自动写入,提醒本仓库使用较新的 Next.js(16.3.0),其 API/约定可能与训练数据不同——写 Next 相关代码前先查 `node_modules/next/dist/docs/`。

## 项目概览

移动端优先的「周三充值日拼图互助」H5:用户发布口令(command)或二维码链接(url)来赠送/求助拼图,他人以最少步骤领取(复制口令唤起中国移动 APP,或跳转白名单链接)。

**架构(2026-08 起):** Supabase Postgres 是数据真相源(账号、信用、帖子、领取),Upstash Redis 退回**只做限流**。信用制「赠一领一」:审核通过赠 1 点,领取一次 -1,发布的 GIVE 帖被**他人**领取给发布者 +1(求助 REQUEST 帖不参与信用)。设计/计划见 `docs/superpowers/specs|plans/2026-08-05-user-accounts-credit-*.md`。

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
- `server/` — 数据访问层,被 `server-only` 守护。`post-repository.ts` 调用 Supabase RPC(`publish_post`/`claim_post`/`delist_post`/`list_hall_posts`);`user-queries.ts` 用会话客户端读「我的帖子/已领取/信用」(RLS 保护);`server/actions.ts` 是下架 Server Action;`rate-limit.ts` 是唯一保留的 Redis 用途。
- `src/lib/supabase/` — 三个客户端:`server.ts`(会话 Cookie,RLS 以用户身份生效,并含 `getCurrentUser`/`getAuthSession`)、`browser.ts`、`admin.ts`(service role,仅供 Server Action 调 RPC,`server-only`)。
- `src/features/auth/` — 邮箱密码登录:`actions.ts`(signIn/signUp/signOut Server Actions)、`schemas.ts`、`components/auth-form.tsx`、`auth-session.tsx`(客户端 `useAuthSession`,由 layout 注入 `{isAuthenticated, publicId}`)。
- 身份**全部**来自 Supabase 账号:客户端组件用 `useAuthSession()` 判断登录态与自己的 `publicId`。旧的匿名设备指纹(`visitorId`/`deviceHash`/`/api/identity`)**已整体移除**。
- `src/proxy.ts` — **Next 16 的 middleware 已改名 proxy**(见记忆),刷新 Supabase 会话并保护 `/publish`、`/me`。
- `src/app/` — App Router:大厅 `page.tsx`、`publish/`、`login/`、`register/`、`me/`(+`posts`/`claimed`)、API 路由(`api/posts`、`api/posts/[id]/claim`)。`me/*` 页面标 `export const dynamic = "force-dynamic"`;根 layout 读会话故整站按需渲染。
- `supabase/migrations/*.sql` — 表结构、RLS、plpgsql 函数(手动在 Supabase 执行)。

### 关键不变量(改动前务必理解)

1. **并发正确性 + 信用变动靠 plpgsql `SECURITY DEFINER` 函数的单事务,不靠应用层。** `claim_post`(锁帖 `FOR UPDATE` → 校验 OPEN/未过期/未领/非自领/余额≥1 → 扣领取人 1 分 → GIVE 帖发布者 +1(受当日封顶)→ 置 CLAIMED + 删去重行 → 返回 payloads,任一失败整事务回滚)是唯一真相源;`publish_post` 同事务去重+插入。改这些 SQL 要同步更新集成测试(Task 10)。
2. **信用规则。** 种子 `SEED_CREDITS`(默认 1);领取 -1(余额 0 → `INSUFFICIENT_CREDITS`/402);GIVE 帖被他人领取给发布者 +1,受 `EARN_CAP_PER_DAY`(默认 5)当日封顶;**REQUEST 帖不参与信用**;流水记 `credit_ledger`(SEED/EARN_CLAIMED/SPEND_CLAIM/REFUND)。
3. **隐私边界。** 大厅只经 `list_hall_posts`/`hall_posts` 视图返回安全列(含 `publisher_public_id`),**绝不返回 `payloads`**;`payloads` 只由 `claim_post` 返回给领取者、或 `user-queries` 返回给本人。二维码图片仅浏览器内经 Canvas+jsQR 解码,**绝不上传**(e2e 有断言)。
4. **RLS。** 四表全开 RLS;`credits`/`payloads` 只经函数变更,客户端无直接 DML 策略;`admin` client(service role)在 Server Action 里调 RPC,函数内自校验归属。
5. **过期。** Postgres 无 TTL:帖子有 `expires_at` 列,读取时过滤 `> now()`;`cleanup_expired_posts()` 供 Cron 定时置 EXPIRED 并清去重行。
6. **游标分页。** keyset `(created_at desc, id desc)`,游标编码 `{createdAt, id}` base64url;比较在 `list_hall_posts` SQL 内完成(不用 PostgREST `.or()` 拼时间戳)。
7. **双来源约束。** 口令与链接可单独或同时提供;客户端与服务端都解析并按白名单校验;双来源必须指向相同的 GIVE/REQUEST 类型。

### 防刷定位(诚实边界)

- **账号是唯一身份与信用主键;IP 是辅助信号。** 登录用邮箱+密码(无短信预算),**新建账号接近免费**,信用制挡的是顺手薅的普通用户,**挡不住铁心刷号者(Sybil)**。
- **发布**:每用户每小时(`PUBLISH_LIMIT_PER_HOUR`)+ 每日(`PUBLISH_LIMIT_PER_DAY`)双限流。
- **领取**:每用户 + 每 IP 每日限流(`CLAIM_LIMIT_PER_DAY`)+ 信用余额约束。上线仍建议在网关补边缘限流。

## 约定

- Redis 惰性初始化:`getRedis()` → `Redis.fromEnv()`,仅用于 `rate-limit.ts`;新服务端模块顶部加 `import "server-only"`。
- API 错误统一 `{ error: { code, message, field? } }`;写操作/领取响应带 `Cache-Control: no-store`;未登录写接口返回 401 `UNAUTHENTICATED`。
- 环境变量(`.env.example`):`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`DEVICE_HASH_SECRET`、信用/限流上限。切勿提交 `.env.local` 或任何密钥。
- 测试就近放置:单测 `*.test.ts(x)`(jsdom),集成 `*.integration.test.ts`(node 环境,针对测试 Postgres),e2e 在 `tests/e2e/`。
