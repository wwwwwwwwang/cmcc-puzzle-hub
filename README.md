# 周三充值日拼图互助

移动端优先的周三充值日拼图互助 H5。用户发布时至少提供口令或二维码链接中的一种，也可以同时保存两种来源；领取者可选择更适合自己的方式。帖子在发布当月结束时自动过期（北京时间次月 1 日 00:00），首位领取者通过 Postgres 单事务原子下架。

数据真相源是 **Supabase Postgres**（账号、信用、帖子、领取与求助确认），Upstash Redis 只做限流。管理员审核通过后赠 1 点；领取赠送消耗 1 点，赠送被他人领取时发布者 +1；发布求助先托管 1 点，助力者在发布者主动确认或 24 小时自动确认后 +1。账号用**用户名 + 密码**注册，注册后进入待审核，管理员在 `/admin` 核对微信群昵称后通过才发信用、才能发布、领取和助力。

> [!IMPORTANT]
> 本项目是社区维护的非官方开源工具，与中国移动通信集团有限公司及其关联公司无隶属、授权、赞助或背书关系。“中国移动”及相关商标归其权利人所有。本项目不保证第三方活动接口、口令、二维码、Deep Link 或客户端行为长期有效；使用者应遵守活动规则、平台条款和适用法律，并自行承担使用风险。

- 源码仓库：<https://github.com/wwwwwwwwang/cmcc-puzzle-hub>
- 零预算部署与开源步骤：[docs/零预算部署与开源指南.md](docs/零预算部署与开源指南.md)

## 本地运行

环境要求：Node.js 22、pnpm 10。

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

打开 <http://localhost:3000>。生产检查使用：

```powershell
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

没有专用 Upstash 测试凭证时，集成测试会明确跳过，不会连接生产 Redis。

## 环境变量与部署

需要一个 Supabase 项目(Postgres + Auth)和一个 Upstash Redis(仅限流)。在 Vercel Production 配置：

```dotenv
# Supabase(账号 + Postgres 真相源)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Upstash Redis(仅限流)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# 限流上限
PUBLISH_LIMIT_PER_HOUR=10
PUBLISH_LIMIT_PER_DAY=10
CLAIM_LIMIT_PER_DAY=10
REGISTER_LIMIT_PER_DAY_PER_IP=3
```

信用上限(`app.seed_credits`、`app.earn_cap_per_day`)是 **Postgres 数据库设置**，不走 `.env`，在 Supabase SQL Editor 用 `alter database ... set` 配置；留空则用函数内默认(种子 1、每日封顶 5)。发布前需在 Supabase 依次执行 `supabase/migrations/0001`→`0008`，并确认 `pg_cron` 中的 `cmcc-request-help-maintenance` 每 5 分钟执行 `sync_request_maintenance()`。`SUPABASE_SERVICE_ROLE_KEY` 权限极高，只在服务端使用，不要提交 `.env.local` 或任何密钥到 Git。

## 账号、审核与信用

- **用户名 + 密码**注册,不用邮箱(内部把归一化用户名的 SHA-256 合成假邮箱喂 Supabase Auth,用户永不接触邮箱)。注册后 `status=PENDING`、不发种子信用。
- 用户改微信群昵称与用户名一致后 @管理员;管理员在 `/admin` 核对后通过,才发 1 点种子信用、才能发布和领取。首个管理员需在 Supabase 手动 `update profiles set is_admin=true, status='APPROVED'`。
- 信用制:领取赠送 -1；赠送帖被**他人**领取给发布者 +1(受每日封顶)；发布求助时 -1 并托管，助力者在主动/自动确认后 +1；未收到时原帖未过期则重新开放，已过期或无人助力到期则退还托管信用。并发正确性与信用变动全靠 plpgsql `SECURITY DEFINER` 函数的单事务,不靠应用层。
- 普通用户的“我的账户”包含“我的帖子”“我领取的”“我帮助的”；管理员额外显示“用户审核”。待确认页面每 30 秒轮询一次，也支持窗口聚焦检查和手动刷新。
- 反多账号(Sybil)靠**微信群成员身份 + 人工审核**,不靠设备指纹(已弃用);IP 仅做注册限流 + `/admin` 同 IP 标黄。

## 隐私边界

- 大厅接口只返回安全列(含发布者公开标识),**绝不返回 `payloads`**;`payloads` 只由领取/助力事务返回给参与者，或在“我领取的”“我帮助的”中经 RLS 返回给本人。
- 大厅列表、信用与帖子读取受 Supabase RLS 保护;`credits`/`payloads` 只经数据库函数变更,客户端无直接写策略。
- 二维码图片只在浏览器内经 Canvas 和 jsQR 解码,不上传图片、不写入请求体或日志。

## 口令与跳转

口令发布前会同时在客户端和服务端解析，并校验折扣宫格选择。二维码 URL 必须通过外层/内层协议、域名、路径和业务参数白名单。双来源发布时，口令和链接必须指向相同的赠送或求助类型；切换输入标签不会清空另一来源，任一来源可单独清除。

赠送帖显示“使用口令领取/使用链接领取”，求助帖显示对应的助力动作。求助提交后等待发布者确认；发布者可选择“确认已收到”或“未收到”，后者会在原截止时间未到时重新开放帖子。首次领取或助力成功会在内存中保留完整响应，因此复制失败后改用另一来源不会重复请求接口。

领取口令时，页面先写入系统剪贴板，再尝试唤起 `leadeon://`。若未自动跳转，页面固定显示“若未自动跳转，请手动打开中国移动 APP”，并提供“再次唤起”。复制失败时不会调用自定义 Scheme，并会展示规范化口令和复制重试。链接领取只对白名单 URL 执行导航。

帖子无 TTL 概念，而是带 `expires_at` 列。Supabase Cron 每 5 分钟调用 `sync_request_maintenance()`，负责求助自动确认、到期退款、赠送过期和去重行清理；维护函数仅授权 `service_role`，不暴露为公共 HTTP 接口。

## 真机验收

上线前至少使用一台 Android 和一台 iPhone，记录设备型号、系统版本、浏览器和结果：

1. 用一个已审核账号登录，分别发布仅口令、仅二维码和双来源内容，确认返回大厅并显示正确的可用来源与发布者公开标识。
2. 另一账号选择口令领取，确认剪贴板写入 `￥...￥`，中国移动 APP 能从剪贴板显示原生拼图弹窗，并确认领取者信用 -1。
3. 验证 `leadeon://` 能拉起中国移动 APP；未安装或未唤起时确认页面显示手动打开提示。
4. 验证链接领取能打开白名单链接；双来源口令复制失败后可改用链接，且不会再次调用领取接口。
5. 验证赠送帖被他人领取后发布者信用 +1，且发布者不能领取自己的帖子、同一帖子只有首个领取者成功。
6. 验证 A 发布求助托管 1 点，B 助力后 A 可主动确认；再验证“未收到”会重新开放且原 B 不能再次助力，24 小时到期可由 Cron 自动确认。
7. 验证二维码图片不会出现在浏览器网络请求中。

## 测试结构

- `src/**/*.test.*`：领域、认证、仓储、API 和组件单测（jsdom）。
- `src/**/*.integration.test.ts`：针对测试用 Postgres/Upstash 的集成测试。
- `tests/e2e/`：Chromium/WebKit 移动流程、二维码隐私和横向溢出检查。

## 许可证

本项目以 [GNU Affero General Public License v3.0](LICENSE) 发布。通过网络向用户提供修改后的版本时，必须按 AGPL-3.0 的要求向这些用户提供对应版本的完整源码。
