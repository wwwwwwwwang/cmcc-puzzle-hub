# 中国移动拼图互助平台

移动端优先的中国移动拼图互助 H5。用户发布时至少提供口令或二维码链接中的一种，也可以同时保存两种来源；领取者可选择更适合自己的方式。记录 24 小时后自动过期，首位领取者通过 Redis 原子下架。

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
- 服务端只保存 `HMAC-SHA256(DEVICE_HASH_SECRET, visitorId)`，大厅接口只返回可用来源类型，不会返回 visitorId、deviceHash、`payloads` 或 `payloadHashes`。
- 这是匿名设备约束，不是账号认证：恶意调用者可以伪造请求体中的 visitorId。上线时应在网关增加 IP/边缘限流；不要把该标识当作登录凭证。
- 清除站点数据、无痕模式和浏览器存储限制会使匿名设备标识重新生成。
- 二维码图片只在浏览器内经 Canvas 和 jsQR 解码，不上传图片、不写入请求体或日志。

## 口令与跳转

口令发布前会同时在客户端和服务端解析，并校验折扣宫格选择。二维码 URL 必须通过外层/内层协议、域名、路径和业务参数白名单。双来源发布时，口令和链接必须指向相同的赠送或求助类型；切换输入标签不会清空另一来源，任一来源可单独清除。

领取前页面会根据帖子内容显示“使用口令领取”“使用链接领取”中的一个或两个动作。首次领取成功会在内存中保留完整响应，因此复制失败后改用链接不会再次请求领取接口。

领取口令时，页面先写入系统剪贴板，再尝试唤起 `leadeon://`。若未自动跳转，页面固定显示“若未自动跳转，请手动打开中国移动 APP”，并提供“再次唤起”。复制失败时不会调用自定义 Scheme，并会展示规范化口令和复制重试。链接领取只对白名单 URL 执行导航。

仓储读取和领取兼容旧的单来源帖子结构。兼容分支不会续期旧记录，因此旧帖子最多在原有 24 小时 TTL 内自然退出。

## 真机验收

上线前至少使用一台 Android 和一台 iPhone，记录设备型号、系统版本、浏览器和结果：

1. 分别发布仅口令、仅二维码和双来源内容，确认返回大厅并显示正确的可用来源。
2. 另一设备选择口令领取，确认剪贴板写入 `￥...￥`，中国移动 APP 能从剪贴板显示原生拼图弹窗。
3. 验证 `leadeon://` 能拉起中国移动 APP；未安装或未唤起时确认页面显示手动打开提示。
4. 验证链接领取能打开白名单链接；双来源口令复制失败后可改用链接，且不会再次调用领取接口。
5. 验证同一设备重试能恢复 5 分钟内的领取回执，其他设备不能再次领取。
6. 验证二维码图片不会出现在浏览器网络请求中。

## 测试结构

- `src/**/*.test.*`：领域、设备、仓储、API 和组件单测。
- `src/**/*.integration.test.ts`：专用 Upstash Redis 集成测试。
- `tests/e2e/`：Chromium/WebKit 移动流程、二维码隐私和横向溢出检查。

## 许可证

本项目以 [GNU Affero General Public License v3.0](LICENSE) 发布。通过网络向用户提供修改后的版本时，必须按 AGPL-3.0 的要求向这些用户提供对应版本的完整源码。
