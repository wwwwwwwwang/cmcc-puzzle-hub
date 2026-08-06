# E2E 测试认证会话设计

## 背景

现有 `tests/e2e/hall-and-publish.spec.ts` 仍通过 `/api/identity` 和浏览器本地设备 ID 模拟当前用户。账号体系迁移到 Supabase 后，`/api/identity` 已删除，根布局和 `proxy.ts` 改为从服务端 Supabase Cookie 会话读取用户。CI 没有 Supabase 测试环境，因此 Playwright 实际以游客身份运行，导致发布按钮和“当前用户”标识不存在。

## 目标

- 让 E2E 在不依赖真实 Supabase 的情况下获得稳定、确定的已审核普通用户会话。
- 同一测试身份同时作用于 Next.js `proxy` 和根布局的 `getAuthSession()`。
- 删除已经失效的 `/api/identity` 请求模拟。
- 保持生产认证逻辑不变，不允许测试身份在生产环境启用。
- 恢复大厅、发布和领取完整 E2E 流程，并避免每个失败用例等待 90 秒。

## 非目标

- 不替代 Supabase 自身的登录、注册或 Cookie 刷新集成测试。
- 不在 GitHub Actions 中创建或维护真实 Supabase 测试用户。
- 不修改生产用户、信用或帖子数据。
- 不为 E2E 绕过实际 API 授权；帖子 API 仍由现有 Playwright 路由模拟负责隔离。

## 方案

### 测试会话协议

新增一个只在服务端使用的 E2E 认证辅助模块。模块接收请求头和运行环境，只有同时满足以下条件时才返回固定测试会话：

1. `NODE_ENV !== "production"`；
2. 服务端存在非空 `E2E_TEST_AUTH_TOKEN`；
3. 请求头 `x-e2e-auth-token` 与环境变量完全匹配。

返回的测试用户是已登录、已审核、非管理员用户，公开标识固定为现有 E2E 使用的 `U-0123456789ABCDEF`。任一条件不满足时返回 `null`，继续执行原 Supabase 认证流程。

### 请求数据流

1. `playwright.config.ts` 为 Playwright 浏览器请求统一增加 `x-e2e-auth-token`。
2. 同一配置把对应 `E2E_TEST_AUTH_TOKEN` 注入 Playwright 启动的 `pnpm dev` 进程。
3. `proxy.ts` 在调用 Supabase 前读取测试会话；匹配时视为已认证，不把 `/publish` 重定向到登录页。
4. `getAuthSession()` 在访问 Supabase 前读取测试会话；匹配时直接向根布局返回固定会话，使客户端显示发布按钮和“当前用户”。
5. 普通开发服务器、构建、Vercel 和没有测试请求头的访问继续走原 Supabase 逻辑。

### 安全边界

- 测试令牌是仅服务端环境变量，不使用 `NEXT_PUBLIC_` 前缀。
- 生产环境硬性拒绝测试会话，即使误配令牌也不会启用。
- 请求头本身不能单独开启测试身份，必须与服务器进程中的令牌匹配。
- 辅助模块只返回最小公开会话信息，不包含邮箱、密码、访问令牌或真实用户 ID。
- 不在日志、测试报告或错误信息中输出令牌。

## 文件职责

- `src/lib/testing/e2e-auth.ts`：纯函数形式验证环境、请求头和令牌，返回固定测试会话。
- `src/lib/testing/e2e-auth.test.ts`：覆盖缺少令牌、错误令牌、生产环境和成功匹配。
- `src/lib/supabase/server.ts`：在 `getAuthSession()` 的 Supabase 分支前读取 E2E 会话。
- `src/proxy.ts`：在受保护路由判断前读取 E2E 会话；仅匹配时跳过未登录重定向。
- `playwright.config.ts`：为测试浏览器和测试开发服务器配置同一令牌。
- `tests/e2e/hall-and-publish.spec.ts`：删除 `/api/identity` 模拟，保留帖子接口模拟和原业务断言。

## 测试策略

### 单元测试

先为 E2E 认证辅助模块编写失败测试，验证：

- 未配置服务器令牌时返回 `null`；
- 请求未携带令牌时返回 `null`；
- 请求令牌不匹配时返回 `null`；
- `NODE_ENV` 为生产环境时返回 `null`；
- 非生产环境且令牌匹配时返回固定的已审核普通用户会话。

### E2E 回归测试

先增加一个快速认证冒烟断言：

- 大厅显示“当前用户”和固定公开标识；
- 访问 `/publish` 不会跳转登录页；
- 选择发布类型和拼图后能看到“发布”按钮。

随后运行原 `hall-and-publish.spec.ts`，确保原来 18 个失败恢复。最终运行完整 `pnpm test:e2e`，三个移动视口均必须通过。

### 常规验证

- `pnpm test:unit`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

## 错误处理

- 测试配置缺失或请求头不匹配时不抛出认证错误，而是安全降级到原认证流程。
- CI 中若测试会话未生效，新增的快速冒烟断言应在短超时内直接指出认证失败，避免业务用例连续等待 90 秒。
- Supabase 未配置时，普通游客行为保持现状。

## 验收标准

- 删除旧 `/api/identity` E2E 模拟。
- 测试会话在生产环境不可启用。
- 未携带正确请求头的本地访问不会获得测试身份。
- E2E 中大厅显示固定当前用户，发布页显示发布按钮。
- 完整 Playwright 结果不再出现原来的 `6 passed / 18 failed`。
- 单元测试、类型检查、lint 和构建保持通过。
