# 中国移动“周三充值日”拼图互助平台设计规格

**日期：** 2026-08-04  
**状态：** 已批准  
**依据：** `项目需求文档.md` 及需求澄清记录

## 1. 产品目标

构建一个仅面向移动端的轻量 H5，让中国移动用户通过口令文本或本地二维码图片发布拼图赠送/索求信息，并让其他用户以最少步骤完成领取、复制口令或跳转中国移动 APP。

首版成功标准：

- 95折、9折、8折宫格分别支持 4、6、9 块拼图选择。
- 未选择拼图时不能发布；口令中的折扣/编号与宫格不一致时拒绝发布。
- 二维码图片只在浏览器本地解析，不上传图片或图片二进制。
- 每条发布数据写入 Redis 时强制设置 86400 秒 TTL。
- 大厅不提前暴露完整口令或 URL，并支持按类型和折扣筛选。
- 首位确认领取者通过原子操作获得载荷，记录立即下架，其他用户不能重复领取。
- 口令领取成功后先复制 `￥...￥` 密钥，再调用 `leadeon://` 唤起中国移动 APP。

## 2. 首版范围

### 2.1 包含

- 匿名浏览、发布和领取。
- FingerprintJS 开源版生成匿名 `visitorId`。
- 发布限流、相同载荷去重、禁止领取本人发布的记录。
- 口令文本解析、图片文件中的二维码本地解析。
- 大厅倒序信息流、类型/折扣筛选和游标分页。
- 领取确认抽屉、并发原子领取、短时幂等回执。
- 移动端蓝白界面、宫格和交互动效、固定底部导航。
- Vercel 部署、Upstash Redis、环境变量示例与 CI 检查。

### 2.2 不包含

- 用户注册、手机号验证、账号找回或跨浏览器身份同步。
- PC 响应式专项适配；宽屏只居中展示最大宽度为 `max-w-md` 的移动视口。
- 后台管理、人工审核、举报、聊天、消息通知或历史领取记录。
- 摄像头实时扫码；首版只读取用户选择的本地二维码图片。
- 对 FingerprintJS `visitorId` 作“真实设备绝对唯一”的承诺。
- 猜测或维护中国移动内部活动路由；口令只使用 `leadeon://` 拉起 APP。

## 3. 技术选型

- Next.js App Router、React 函数组件、TypeScript。
- Tailwind CSS、shadcn/ui、Lucide React。
- Motion（Framer Motion 包的当前 React API）实现克制的弹簧缩放与切换动画。
- `jsQR` 解析本地图片中的二维码；使用 Canvas 读取像素，不发起图片上传。
- `@fingerprintjs/fingerprintjs` 获取浏览器 `visitorId`。
- `@upstash/redis` 保存短期记录，`@upstash/ratelimit` 实现发布限流。
- Zod 定义共享输入结构和服务端边界校验。
- Vitest、Testing Library、Playwright 构成测试栈。

选择 Route Handlers 而非 Server Actions。浏览器本地解析、API 边界和未来客户端接入可以保持清晰分离，接口也更容易独立测试。

## 4. 页面与交互设计

### 4.1 应用外壳

- 全局页面为浅灰外部背景，中间是 `w-full max-w-md min-h-dvh mx-auto bg-white` 移动视口。
- 底部固定两个入口：`大厅` 和 `发布`，使用 Lucide 图标与文本标签。
- 内容区为底部导航和系统安全区预留空间，避免遮挡。
- 默认路由 `/` 为大厅，`/publish` 为发布页。

### 4.2 互助大厅

- 页头显示“拼图互助大厅”和简短时效信息。
- 筛选项分为类型（全部、赠送、索求）和折扣（全部、95折、9折、8折）。
- 首次请求与筛选变化使用骨架状态；无数据展示空状态；失败展示原地重试。
- 卡片只展示 `type`、`discount`、`pieceNumber`、相对发布时间和“一键领取”。
- 点击按钮只打开确认抽屉，不立即占用记录。
- 用户在抽屉点击确认后才调用领取接口。

### 4.3 发布页

- 顶部使用 95折、9折、8折分段控制器。
- 分别呈现 2x2、2x3、3x3 宫格；单次只能选中一块。
- 选中块使用科技蓝高亮并带轻量弹簧反馈；切换折扣时清除旧选择，防止折扣和编号组合失真。
- 未选中拼图时，口令输入和图片按钮均禁用。
- 选中后展示双轨发布区：粘贴口令，或选择二维码图片。
- 客户端解析成功后展示规范化预览：赠送/索求、折扣、编号、载荷类型。
- 口令显式属性与宫格选择不一致时阻止提交并指出冲突；用户输入和宫格选择保持不变。
- 发布成功后清空输入与选择，并返回大厅定位到最新记录。

### 4.4 领取结果

- URL 载荷：提示即将前往中国移动 APP，确认后跳转经过白名单校验的完整 URL。
- 口令载荷：将规范化后的 `￥密钥￥` 写入剪贴板；写入成功后执行 `window.location.href = "leadeon://"`。
- 页面始终保留“若未自动跳转，请手动打开中国移动 APP”的提示和“再次唤起”按钮。
- 剪贴板写入失败时不唤起 APP，展示可手动复制的口令和重试按钮。
- 浏览器无法可靠判定自定义 Scheme 是否成功，界面不展示虚假的“已打开”状态。

## 5. 组件边界

- `AppShell`：移动视口、页面内容区域和底部导航。
- `DeviceIdentityProvider`：懒加载 FingerprintJS、缓存 `visitorId`、向发布/领取动作提供身份。
- `PuzzleSelectionProvider`：跨 `/publish` 子组件保存当前折扣和拼图编号。
- `PuzzleBoard`：根据折扣渲染稳定尺寸宫格并处理单选。
- `PublishPanel`：口令输入、图片选择、解析预览、校验错误和提交状态。
- `QrImagePicker`：读取图片、Canvas 解码和本地隐私边界。
- `PostFilters`：把筛选条件同步到 URL 查询参数。
- `PostFeed`：游标分页、加载/空/错误状态和卡片列表。
- `PostCard`：只消费安全大厅 DTO，不接触敏感载荷。
- `ClaimDrawer`：确认、领取请求、成功动作和已领取/过期反馈。

解析器、Redis 仓储和领取脚本必须是界面组件之外的独立模块，能够在没有 React 环境时测试。

## 6. 解析与规范化规则

### 6.1 口令文本

服务端和客户端共同调用同一组纯函数：

- 提取且只允许一个 `￥...￥` 密钥，规范化结果保留两侧 `￥`。
- `送你一张` 识别为 `GIVE`。
- `还差一张` 或 `为我助力` 识别为 `REQUEST`。
- 从中文引号内的 `95折N号拼图`、`9折N号拼图` 或 `8折N号拼图` 提取折扣和编号。
- 95折编号范围为 1-4，9折为 1-6，8折为 1-9。
- 类型冲突、多个密钥、缺少属性或编号越界均返回解析失败。
- 折扣/编号与当前宫格选择不一致时返回 `SELECTION_MISMATCH`。
- Redis 中的口令载荷只保存规范化后的 `￥密钥￥`，不保存整段推广文案。

### 6.2 二维码 URL

- 图片只由浏览器解码为字符串，服务端仍重新解析 URL。
- 外层协议必须为 HTTPS。
- 外层主机必须精确等于 `h.app.coc.10086.cn`，路径必须为 `/activity/zx/transit/transferDownload.html`。
- 必须存在可解码的 `targetUrl`。
- 内层主机必须精确等于 `wx.10086.cn`，路径必须匹配 `/hlwyxhdhub/act-wedrecharge/<活动编号>`。
- 内层查询参数必须包含且只包含业务类型字段中的一个：`giveCard` 或 `requestCard`。
- `giveCard` 映射为 `GIVE`，`requestCard` 映射为 `REQUEST`。
- URL 样本不携带可读折扣和编号，因此这两个属性取当前宫格选择；服务端不伪造无法从 URL 推导的一致性校验。
- Redis 中保存通过白名单校验的完整外层 URL。

## 7. 匿名设备身份

- `DeviceIdentityProvider` 优先读取 `localStorage` 中的 `cmcc-puzzle-device-id`；存在时直接复用，确保正常关闭并重新打开浏览器后标识不丢失。
- 本地没有缓存时才加载 FingerprintJS 开源版并取得 `visitorId`，随后写入 `cmcc-puzzle-device-id`。清除站点数据、无痕模式或浏览器存储限制仍会使标识重置。
- 客户端随发布和领取请求发送 `visitorId`，但服务端不把它视为可信认证凭证。
- 服务端计算 `HMAC-SHA256(DEVICE_HASH_SECRET, visitorId)`，Redis 只保存结果 `deviceHash`。
- `deviceHash` 用于发布限流、载荷去重关联和禁止自领；不用于构建账号档案。
- 首版默认每个 `deviceHash` 每小时最多发布 10 条，通过服务端配置调整。

## 8. API 契约

### 8.1 `GET /api/posts`

查询参数：

- `type`: `GIVE | REQUEST`，可选。
- `discount`: `95 | 90 | 80`，可选。
- `cursor`: 上一页返回的游标，可选。
- `limit`: 服务端限制为 1-20，默认 20。

响应只含安全 DTO：

```ts
type HallPostDto = {
  id: string;
  type: "GIVE" | "REQUEST";
  discount: 95 | 90 | 80;
  pieceNumber: number;
  payloadKind: "COMMAND" | "URL";
  createdAt: string;
  expiresAt: string;
};
```

### 8.2 `POST /api/posts`

```ts
type CreatePostInput = {
  selection: { discount: 95 | 90 | 80; pieceNumber: number };
  source: { kind: "COMMAND" | "URL"; value: string };
  visitorId: string;
};
```

服务端重新解析、校验、限流并去重。成功返回安全 DTO，不返回存储载荷。

### 8.3 `POST /api/posts/[id]/claim`

```ts
type ClaimPostInput = { visitorId: string };

type ClaimPostResult =
  | { payloadKind: "COMMAND"; payload: string }
  | { payloadKind: "URL"; payload: string };
```

成功结果只返回给首位领取设备，或在 5 分钟内返回给同一设备的幂等重试。

### 8.4 错误格式

```ts
type ApiError = {
  error: {
    code:
      | "INVALID_INPUT"
      | "INVALID_CONTENT"
      | "SELECTION_MISMATCH"
      | "DUPLICATE_POST"
      | "RATE_LIMITED"
      | "SELF_CLAIM_FORBIDDEN"
      | "ALREADY_CLAIMED"
      | "EXPIRED"
      | "SERVICE_UNAVAILABLE";
    message: string;
    field?: string;
  };
};
```

HTTP 状态分别使用 400、403、404、409、429、503，界面依据稳定 `code` 决定提示，不解析服务端消息文本。

## 9. Redis 数据模型

### 9.1 发布记录

键：`post:{id}`，JSON 值：

```ts
type StoredPost = HallPostDto & {
  payload: string;
  publisherDeviceHash: string;
  payloadHash: string;
};
```

每次写入必须显式执行 `redis.set(key, value, { ex: 86400 })`。

记录 ID 格式固定为 `p_<expiresAtMillis>_<randomUUID>`。服务端校验完整格式；ID 中的到期时间仅用于记录已经不存在时区分“自然过期”和“已被领取”，不能替代 Redis TTL，也不接受客户端自定义 ID。

### 9.2 大厅索引

- 使用四类 ZSET：全量 `hall:posts`、类型 `hall:type:{type}`、折扣 `hall:discount:{discount}`、类型与折扣组合 `hall:type:{type}:discount:{discount}`。
- member 为记录 ID，score 为毫秒时间戳；查询依据筛选条件只读取一个对应索引。
- ZSET 不保存敏感载荷。列表读取遇到已过期的 `post:{id}` 时，从四个相关索引批量移除孤立 member。
- 新发布记录通过同一个 Lua 脚本写入详情键、去重键和四个 ZSET，避免部分成功。

### 9.3 去重与限流

- `dedupe:{payloadHash}` 使用 `SET NX EX 86400`，其中摘要基于规范化口令或规范化 URL。
- 去重键在记录被领取后仍保留至 24 小时结束，阻止相同载荷立即重新发布。
- 发布限流由 `@upstash/ratelimit` 使用 `rate:publish:{deviceHash}` 命名空间，默认滑动窗口 10 次/小时。

### 9.4 领取回执

- 键：`claim:{id}`。
- 值包含领取者 `deviceHash`、`payloadKind` 和 `payload`。
- TTL 固定为 300 秒，用于网络中断后的同设备幂等重试。

## 10. 原子领取算法

Lua 脚本在一次 Redis 执行中完成：

1. 若 `claim:{id}` 存在且领取者等于当前 `deviceHash`，返回回执载荷。
2. 若发布记录和回执都不存在，比较服务端当前时间与记录 ID 中的 `expiresAtMillis`：已经到期返回 `EXPIRED`，否则返回 `ALREADY_CLAIMED`。
3. 若发布者 `deviceHash` 等于当前设备，返回 `SELF_CLAIM_FORBIDDEN`，不修改数据。
4. 写入 300 秒领取回执。
5. 删除 `post:{id}` 并从该记录对应的四个大厅索引移除 ID。
6. 返回载荷。

确认抽屉打开和取消均不调用脚本，因此不会占用记录。Redis Lua 串行执行确保两个并发领取者只有一个成为首位领取者。

## 11. 客户端状态与数据流

### 11.1 发布

`选择宫格 → 输入口令/选择图片 → 客户端解析预览 → POST /api/posts → 服务端重解析与写入 → 返回大厅`

- Redis 或网络失败时保留选择、输入和预览。
- 提交中禁用重复提交。
- 客户端解析只改善反馈速度，不能替代服务端验证。

### 11.2 领取

`点击一键领取 → 打开确认抽屉 → 用户确认 → POST claim → 获得载荷 → 复制/跳转`

- `ALREADY_CLAIMED` 时关闭动作区并从本地列表移除记录。
- `SELF_CLAIM_FORBIDDEN` 时保留卡片并说明不能领取自己发布的内容。
- 网络错误时允许原地重试；服务端 5 分钟回执避免成功响应丢失后无法恢复载荷。

## 12. 安全与隐私

- Route Handler 对所有请求执行 Zod 校验和解析器校验。
- 跳转 URL 必须经过双层域名、协议、路径和业务参数白名单检查，防止开放重定向。
- UI 只以文本节点呈现用户来源内容，不使用 `dangerouslySetInnerHTML`。
- 大厅响应不含口令、URL、`visitorId`、`deviceHash` 或 `payloadHash`。
- 服务端日志不记录完整口令、URL 查询串、原始 `visitorId` 或 Redis Token。
- 二维码图片不进入 `fetch`、表单提交、日志或持久状态。
- `DEVICE_HASH_SECRET` 和 Upstash 凭证只存在于服务端环境变量。

## 13. 错误与降级行为

- 本地没有缓存且 FingerprintJS 初始化中：大厅可读，发布/领取动作显示加载状态。
- 本地没有缓存且 FingerprintJS 初始化失败：动作不可用，显示刷新重试，不生成随机替代身份。
- 图片无法解码或包含非白名单 URL：提示重新选择图片，不提交。
- 剪贴板写入失败：不调用 `leadeon://`，展示口令和复制重试。
- `leadeon://` 无法拉起 APP：固定显示“若未自动跳转，请手动打开中国移动 APP”，并允许再次唤起。
- Redis 不可用：API 返回 `SERVICE_UNAVAILABLE`，客户端保留本地操作状态。
- 大厅 ZSET 含孤立 ID：列表请求忽略并异步/批量清理，不向用户渲染空卡片。

## 14. 测试策略

### 14.1 单元测试

- 使用 PRD 的两条口令和两条完整 URL 作为固定样本。
- 覆盖口令类型、折扣、编号、密钥、中文标点、多个密钥、缺字段、范围错误和选择冲突。
- 覆盖 URL 双层解析、编码后的 `targetUrl`、协议/域名/路径白名单以及同时出现 `giveCard`/`requestCard`。
- 覆盖 HMAC 设备摘要和安全 DTO 映射。

### 14.2 组件测试

- 未选择宫格时双轨发布区禁用。
- 95折、9折、8折分别稳定渲染 4、6、9 块。
- 切换折扣清除旧选择。
- 解析冲突、提交失败、领取失败时保留或更新正确状态。
- 领取确认前不请求 claim 接口。

### 14.3 Redis 集成测试

- 使用独立测试 Upstash 数据库或隔离前缀。
- 断言详情键 TTL 接近 86400 秒、领取回执 TTL 接近 300 秒。
- 验证 `SET NX` 去重、滑动窗口限流、禁止自领和孤立索引清理。
- 并发发起至少两个领取请求，断言只有一个设备收到载荷。
- 模拟成功响应丢失，同设备重试仍取得回执，其他设备不能取得。

### 14.4 端到端与视觉测试

- 口令发布到领取完整闭环。
- 二维码本地解析到 URL 跳转完整闭环。
- 拦截浏览器网络请求，断言图片数据未上传。
- 375x667、390x844、430x932 视口无横向滚动、文字溢出或底栏/抽屉遮挡。
- 检查宫格点击、切换和抽屉动效不会改变固定布局尺寸。

### 14.5 真机验收

- 至少一台 Android 和一台 iPhone。
- 验证系统剪贴板权限、`leadeon://` 唤起、未安装 APP 时的降级提示。
- 验证中国移动客户端从剪贴板读取 `￥...￥` 后的原生弹窗行为。
- 真机结果作为上线前人工门禁，因为桌面浏览器自动化不能证明外部 APP 行为。

## 15. 配置与部署

`.env.example` 需要包含：

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DEVICE_HASH_SECRET=
PUBLISH_LIMIT_PER_HOUR=10
```

- Vercel Preview 和 Production 分别配置对应环境变量。
- CI 执行 lint、类型检查、单元/组件测试和生产构建。
- Redis 集成测试只在配置专用测试凭证时运行，不能复用生产数据前缀。
- Playwright 在构建后的本地服务上运行核心移动端流程。

## 16. 验收条件

1. 四条 PRD 真实样本均能得到预期解析结果。
2. 口令选择不匹配、恶意 URL、重复载荷和超限发布均被服务端拒绝。
3. Redis 发布详情 TTL 为 24 小时，领取回执 TTL 为 5 分钟。
4. 同一记录并发领取时恰好一个设备获得载荷，记录随后从大厅消失。
5. 发布者不能领取自己的记录。
6. 大厅接口和页面源代码不暴露待领取载荷。
7. 二维码图片不出现在任何网络请求中。
8. 口令复制后调用 `leadeon://`，同时始终提供手动打开 APP 的失败提示。
9. 三个目标移动视口无溢出、遮挡或布局跳动。
10. 自动化门禁通过，Android 与 iPhone 真机领取闭环完成。
