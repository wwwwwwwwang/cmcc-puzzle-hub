# 中国移动拼图互助平台

移动端优先的中国移动拼图互助 H5。用户可以发布口令或二维码链接，浏览大厅并匿名领取；记录 24 小时后自动过期，首位领取者通过 Redis 原子下架。

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

在 Upstash 创建专用 Redis 数据库，并在 Vercel Preview/Production 中分别配置：

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DEVICE_HASH_SECRET=
PUBLISH_LIMIT_PER_HOUR=10
```

默认每个匿名设备每小时最多发布 10 条。发布详情和去重键 TTL 为 24 小时，领取回执 TTL 为 5 分钟。部署前不要把 `.env.local` 或 Redis Token 提交到 Git。

## 隐私与设备标识

- FingerprintJS 取得的 `visitorId` 会持久化到 `localStorage` 的 `cmcc-puzzle-device-id`，正常关闭并重新打开浏览器不会丢失。
- 服务端只保存 `HMAC-SHA256(DEVICE_HASH_SECRET, visitorId)`，大厅接口不会返回 visitorId、deviceHash、payload 或 payloadHash。
- 这是匿名设备约束，不是账号认证：恶意调用者可以伪造请求体中的 visitorId。上线时应在网关增加 IP/边缘限流；不要把该标识当作登录凭证。
- 清除站点数据、无痕模式和浏览器存储限制会使匿名设备标识重新生成。
- 二维码图片只在浏览器内经 Canvas 和 jsQR 解码，不上传图片、不写入请求体或日志。

## 口令与跳转

口令发布前会同时在客户端和服务端解析，并校验折扣宫格选择。二维码 URL 必须通过外层/内层协议、域名、路径和业务参数白名单。

领取口令时，页面先写入系统剪贴板，再尝试唤起 `leadeon://`。若未自动跳转，页面固定显示“若未自动跳转，请手动打开中国移动 APP”，并提供“再次唤起”。复制失败时不会调用自定义 Scheme。链接领取只对白名单 URL 执行导航。

## 真机验收

上线前至少使用一台 Android 和一台 iPhone，记录设备型号、系统版本、浏览器和结果：

1. 发布真实赠送口令或二维码，确认返回大厅并可筛选到记录。
2. 另一设备点击领取并确认，确认剪贴板写入 `￥...￥`，中国移动 APP 能从剪贴板显示原生拼图弹窗。
3. 验证 `leadeon://` 能拉起中国移动 APP；未安装或未唤起时确认页面显示手动打开提示。
4. 验证同一设备重试能恢复 5 分钟内的领取回执，其他设备不能再次领取。
5. 验证二维码图片不会出现在浏览器网络请求中。

## 测试结构

- `src/**/*.test.*`：领域、设备、仓储、API 和组件单测。
- `src/**/*.integration.test.ts`：专用 Upstash Redis 集成测试。
- `tests/e2e/`：Chromium/WebKit 移动流程、二维码隐私和横向溢出检查。
