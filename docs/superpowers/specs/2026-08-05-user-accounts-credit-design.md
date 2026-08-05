# 用户账号与「赠一领一」信用制设计

## 目标

引入轻量用户系统,让每位用户拥有可持久化的**信用余额**,以「发布的赠送被别人领取 +1,领取一次 -1」的规则约束领取与发布数量,并让用户能查看和管理自己发布的拼图帖子。数据主真相源从纯 Redis(24h TTL)迁移到 Supabase PostgreSQL,Redis 退回只做限流与验证码。

## 背景与现状

- 现状无账号:身份是客户端 FingerprintJS 的 `visitorId`,服务端存 `HMAC-SHA256` 得的 `deviceHash`,请求体可伪造、清站点数据即重置。
- 现状帖子/领取全存 Upstash Redis,24h TTL,「每帖单一赢家 + 禁止自领 + 5 分钟幂等回执」靠 `claim-script.ts` 的 Lua 脚本保证原子性。
- 发布已有每设备每小时限流(`@upstash/ratelimit`),领取无任何按用户/设备的次数上限。

## 定位与非目标(先对齐再实现)

**这套机制的抗薅能力上限 = 新建账号的难度。** 本设计采用**无短信预算**的登录方式,新建账号接近免费,因此:

- 信用制的作用是「给普通顺手薅的用户加门槛 + 提供用户自管理能力」,**不是**抵御铁心刷号者(Sybil)的手段。
- **账号是信用账本的主键;`deviceHash` / IP 降级为辅助反刷信号**(用于限流与冷启动风控),不再作为身份或账本主键。
- 不追求军事级防薅;不做实名;不存手机号等强 PII。

### 不在范围内

- 不引入手机号 OTP / 短信;不做实名认证。
- 不做跨用户的社交关系、评论、举报工作流(后续可另开)。
- 不改动口令/URL 白名单解析逻辑与二维码「不上传、仅浏览器内解码」的隐私约束。
- 不做历史 Redis 数据迁移:现有帖子均为 24h 临时数据,上线时直接切换、空库重来。

## 架构总览

```
用户 → Vercel(Next.js:页面 + API Route + Server Actions)
                 ├── Supabase Postgres  ← 用户、信用账本、帖子、领取(真相源)
                 └── Upstash Redis      ← 发布/领取限流(退回纯限流角色)
```

- **身份/会话**:Supabase Auth,`@supabase/ssr` 管理 Cookie 会话,Next middleware 刷新会话。
- **数据真相源**:Postgres。帖子、领取、信用余额与流水均在此,受 RLS 保护。
- **原子事务**:领取与发布的核心并发正确性由 plpgsql `SECURITY DEFINER` 函数在**单个事务**内保证,替换现有 Redis Lua 脚本。
- **Redis**:仅保留发布限流,并新增领取限流(按 userId + IP 双维度),不再持有帖子/领取状态。

## 数据模型(Postgres)

- `profiles`:`id`(= `auth.users.id`)、`public_id`(对外展示,沿用 `U-XXXX` 风格)、`credits int`(物化余额)、`created_at`。注册时经 DB 触发器自动建行并发放**种子信用**。
- `posts`:`id`、`publisher_id`、`type`(GIVE/REQUEST)、`discount`、`piece_number`、`payloads jsonb`、`available_payload_kinds`、`status`(OPEN/CLAIMED/EXPIRED)、`claimant_id`、`created_at`、`expires_at`、`claimed_at`。取代 Redis 帖子 + 有序集合索引 + 领取回执。
- `active_payload_hashes`:`hash`(唯一约束)、`post_id`。取代 Redis 去重键;帖子领取/过期时删除对应行。
- `credit_ledger`:`id`、`user_id`、`delta`、`reason`(SEED/EARN_CLAIMED/SPEND_CLAIM/…)、`post_id`、`created_at`。信用变动的**不可变审计流水**,与余额变动同事务写入。

TTL 用 `expires_at` 列 + 读取时过滤 + 定时清理(pg_cron 或 Vercel Cron 调用清理函数)替代 Redis 自动过期。分页用 `(created_at, id)` keyset 游标,等价替换现有 zset 游标。

## 信用规则

- **种子信用**:新用户注册即获得 N 点(默认 **1**),解决冷启动——否则新人既无可领、又无从赚分。
- **领取**:成功领取一次 **-1**;余额不足则拒绝(错误码 `INSUFFICIENT_CREDITS`)。
- **赚取**:发布者的**赠送(GIVE)帖子被「别人」领取**时,发布者 **+1**。发布本身不加分(防发假赠送刷分)。
- **反对刷(尽力而为,非强保证)**:领取人与发布者共享 IP/`deviceHash` 时,该次领取**不给发布者 +1**(仍照常扣领取人 1 点);按天设赚取封顶(默认 **5/天**)。这些是信号级风控,配合限流,挡不住换 IP + 换账号的 Sybil。

## 领取事务(核心不变量)

领取通过 Server Action 校验会话后,以 service role 调用 plpgsql 函数 `claim_post(post_id, claimant_id, claimant_ip, claimant_device_hash)`,在**单个事务**内:

1. `SELECT ... FOR UPDATE` 锁定帖子行。
2. 校验:帖子存在且 `status=OPEN`、未过期(`now < expires_at`)、`claimant_id IS NULL`、`publisher_id <> claimant_id`(禁止自领)、领取人 `credits >= 1`。
3. 幂等:若该帖 `claimant_id` 已等于当前用户,直接返回 `payloads`(替代 5 分钟回执)。
4. 变更:领取人 `credits -= 1` 并写流水;满足反对刷条件时发布者 `credits += 1` 并写流水;`posts.status=CLAIMED`、写 `claimant_id/claimed_at`;删除该帖 `active_payload_hashes`。
5. 返回 `payloads`。

失败分支返回明确状态:`SELF_CLAIM_FORBIDDEN` / `ALREADY_CLAIMED` / `EXPIRED` / `INSUFFICIENT_CREDITS` / `INVALID_POST_ID`。**任一失败整事务回滚**,余额与帖子状态不会出现半更新。

发布同理走 `publish_post(...)` 函数:同事务内校验发布上限、`active_payload_hashes` 唯一去重、插入帖子行,冲突返回 `DUPLICATE_POST`。

## 权限与隐私(RLS)

- `posts`:大厅列表(`SELECT`)只暴露非敏感列,**`payloads` 绝不进入大厅响应**;`payloads` 仅对发布者本人与领取成功者可见(经函数返回或受限视图)。
- `profiles`:用户只能读写自己的行;`credits` 只能由 `SECURITY DEFINER` 函数变更,客户端不可直接改。
- `credit_ledger`:用户只读自己的流水,任何人不可改。
- 大厅接口继续只返回 `publicId` + 可用来源类型,不返回 `deviceHash` / `payloads` / 原始 hash。
- Server Action 用 service role 调函数,RLS 防止客户端直连绕过;函数内自行做归属校验。

## 用户自管理

- 「我的帖子」:列出本人发布的帖子及状态(OPEN/CLAIMED/EXPIRED),支持**主动下架**未被领取的 OPEN 帖(同事务删索引/去重行)。
- 「我领取的」:列出本人领取过的帖子与其 `payloads`(便于复制/再次唤起)。
- 信用概览:当前余额 + 最近流水(来自 `credit_ledger`)。

## 限流(Redis 保留角色)

- 发布:沿用现每设备每小时上限,并叠加**每用户每日发布上限**(默认 **10/天**)。
- 领取:新增**每用户 + 每 IP 每日领取上限**(默认 **10/天**),用现成 `@upstash/ratelimit` 滑动窗口。
- 以上是限速,不是余额;余额约束在 Postgres 事务里。

## 对现有代码的影响

- `src/features/posts/server/`:`claim-script.ts` / `PUBLISH_POST_SCRIPT` / zset 索引 / `keys.ts` 大部分退役,`post-repository` 改为调用 Supabase RPC。`redis.ts` 仅供限流。
- `device/`:`visitorId`/`deviceHash` 保留为辅助信号并随请求传给领取函数;不再是身份主键。
- `api/posts`、`api/posts/[id]/claim`:改为要求登录会话,委托 Server Action / RPC。
- 新增登录/注册页、会话 middleware、`@supabase/ssr` 客户端封装、「我的帖子/领取/信用」页面。
- 兼容旧 Redis 单来源结构的 `normalizeStoredPost` 及相关分支删除(空库切换,无历史数据)。

## 测试策略

- 单测:信用规则纯函数、RLS 无法覆盖的输入校验、Server Action 参数校验。
- 集成测试:改为针对**本地/测试 Supabase Postgres**(替换现 Upstash 集成测试),重点覆盖 `claim_post` 的并发单一赢家、幂等、余额不足、禁止自领、过期、反对刷不加分;`publish_post` 的去重与发布上限。沿用「无测试凭证则 `describe.skip`」约定。
- e2e:注册→发布赠送→他账号领取(信用 -1 / 发布者 +1)→余额不足被拒→自管理下架;并保留二维码不上传的网络断言。

## 验收标准

1. 未登录用户无法发布/领取;登录后可发布并在大厅可见(不含 payloads)。
2. 领取成功后领取人余额 -1、被领取的 GIVE 发布者余额 +1(共享 IP/设备时不加分),且余额与帖子状态变更同事务、失败全回滚。
3. 余额为 0 的用户领取被拒并返回 `INSUFFICIENT_CREDITS`。
4. 禁止自领;每帖并发下仅一个赢家;同一用户重复领取幂等返回同一 payloads。
5. 帖子超过 `expires_at` 后不可领取且从大厅消失;去重行随领取/过期清除。
6. 用户能查看并下架自己未被领取的帖子、查看已领取帖子的 payloads 与信用流水。
7. 大厅/接口不泄露 `deviceHash` / `payloads` / 原始 hash;二维码图片不进入任何网络请求。
8. 发布/领取每日限流生效;lint、typecheck、单测、(有凭证时)集成测试、build、e2e 全绿。

## 待定参数(评审时确认,含推荐默认)

1. **登录方式**:推荐 **Supabase 邮箱 + 密码**(零短信成本、可自助注册、余额可归属)。备选:匿名登录(体验最顺但账号无限刷,信用制近乎失效);后续可加微信 OAuth(需公众号/开放平台资质)。
2. **种子信用 N**:默认 **1**(能领一次,鼓励先赠再领);可设 0(强制先赠才可领,冷启动更硬)。
3. **REQUEST(求助)帖子的信用语义**:默认 **求助帖不参与信用**——求助不扣领取人信用、被响应也不加分,仅作信息展示;信用只在 GIVE 帖生效。备选:领取求助也按赠一领一计。**这是最需要你拍板的产品语义。**
4. **每日上限**:发布默认 10/天、领取默认 10/天、赚取封顶默认 5/天。
```
