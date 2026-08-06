# E2E 测试认证会话实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用非生产、密钥保护的测试会话替换已失效的 `/api/identity` E2E 身份模拟，恢复大厅、发布和领取完整 Playwright 流程。

**Architecture:** 新增纯函数 `getE2eAuthSession()` 验证运行环境和同源测试 Cookie，在匹配时返回固定已审核普通用户会话。父级 E2E 启动器每次生成随机令牌，Next.js 根布局认证与 `proxy` 读取同一 Cookie；业务 API 仍使用现有路由模拟。

**Tech Stack:** Next.js 16.3 App Router、TypeScript、Vitest、Playwright、Supabase SSR

---

## 执行中安全审查调整

原计划中的全局 `x-e2e-auth-token` 请求头方案已被安全审查否决并由以下方案取代：

- `scripts/run-e2e.mjs` 在父进程中每次生成 32 字节随机令牌，避免 Playwright 多进程重复加载配置时产生不同令牌。
- `playwright.config.ts` 使用独立的 `127.0.0.1:3100`，禁用已有开发服务器复用，并把父进程令牌注入 Next.js webServer。
- Playwright 只给应用同源写入 HttpOnly `cmcc-e2e-auth` Cookie；外部 CMCC 请求新增断言，确保不携带测试认证头或 Cookie。
- `proxy.ts` 和 `getAuthSession()` 改用 Next.js Cookie API 读取测试令牌。

下面原始任务中的请求头代码块保留为计划历史，执行结果以本节调整和最终代码为准。

### Task 1: 建立测试会话安全边界

**Files:**
- Create: `src/lib/testing/e2e-auth.test.ts`
- Create: `src/lib/testing/e2e-auth.ts`

- [ ] **Step 1: 编写失败单元测试**

创建 `src/lib/testing/e2e-auth.test.ts`，覆盖缺少服务器令牌、缺少请求头、错误令牌、生产环境和正确令牌：

```ts
import { describe, expect, it } from "vitest";

import { getE2eAuthSession } from "./e2e-auth";

const validEnvironment = {
  nodeEnv: "test",
  authToken: "test-secret",
};

describe("getE2eAuthSession", () => {
  it("缺少服务端令牌时不启用测试会话", () => {
    expect(
      getE2eAuthSession(new Headers({ "x-e2e-auth-token": "test-secret" }), {
        nodeEnv: "test",
      }),
    ).toBeNull();
  });

  it("缺少或携带错误请求令牌时不启用测试会话", () => {
    expect(getE2eAuthSession(new Headers(), validEnvironment)).toBeNull();
    expect(
      getE2eAuthSession(
        new Headers({ "x-e2e-auth-token": "wrong-secret" }),
        validEnvironment,
      ),
    ).toBeNull();
  });

  it("生产环境始终禁用测试会话", () => {
    expect(
      getE2eAuthSession(new Headers({ "x-e2e-auth-token": "test-secret" }), {
        nodeEnv: "production",
        authToken: "test-secret",
      }),
    ).toBeNull();
  });

  it("非生产环境令牌匹配时返回固定已审核普通用户", () => {
    expect(
      getE2eAuthSession(
        new Headers({ "x-e2e-auth-token": "test-secret" }),
        validEnvironment,
      ),
    ).toEqual({
      isAuthenticated: true,
      isApproved: true,
      isAdmin: false,
      publicId: "U-0123456789ABCDEF",
      username: "e2e-user",
    });
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm exec vitest run src/lib/testing/e2e-auth.test.ts`

Expected: FAIL，提示找不到 `./e2e-auth` 模块。

- [ ] **Step 3: 编写最小实现**

创建 `src/lib/testing/e2e-auth.ts`：

```ts
export const E2E_AUTH_HEADER = "x-e2e-auth-token";
export const E2E_PUBLIC_ID = "U-0123456789ABCDEF";

type E2eAuthEnvironment = {
  nodeEnv?: string;
  authToken?: string;
};

const E2E_SESSION = {
  isAuthenticated: true,
  isApproved: true,
  isAdmin: false,
  publicId: E2E_PUBLIC_ID,
  username: "e2e-user",
} as const;

export function getE2eAuthSession(
  requestHeaders: Pick<Headers, "get">,
  environment: E2eAuthEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    authToken: process.env.E2E_TEST_AUTH_TOKEN,
  },
) {
  if (environment.nodeEnv === "production" || !environment.authToken) {
    return null;
  }

  if (requestHeaders.get(E2E_AUTH_HEADER) !== environment.authToken) {
    return null;
  }

  return E2E_SESSION;
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `pnpm exec vitest run src/lib/testing/e2e-auth.test.ts`

Expected: 4 tests passed。

### Task 2: 将测试会话接入 Next.js 服务端认证

**Files:**
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/proxy.ts`
- Test: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 运行现有快速失败 E2E，确认回归仍为 RED**

Run: `pnpm test:e2e -- tests/e2e/hall-and-publish.spec.ts --project="430x932" --grep "大厅展示公开用户标识"`

Expected: FAIL，`当前用户` 元素不存在。

- [ ] **Step 2: 在根布局认证中读取测试会话**

修改 `src/lib/supabase/server.ts`：

```ts
import { cookies, headers } from "next/headers";
import { getE2eAuthSession } from "@/lib/testing/e2e-auth";

export async function getAuthSession(): Promise<SessionProfile> {
  const e2eSession = getE2eAuthSession(await headers());
  if (e2eSession) return e2eSession;

  // 保留现有 Supabase 认证逻辑。
}
```

- [ ] **Step 3: 在 Proxy 中读取测试会话**

修改 `src/proxy.ts`，在 Supabase 初始化前安全短路：

```ts
import { getE2eAuthSession } from "@/lib/testing/e2e-auth";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (getE2eAuthSession(request.headers)) {
    return response;
  }

  // 保留现有 Supabase 会话刷新和受保护路由逻辑。
}
```

### Task 3: 让 Playwright 注入匹配令牌并删除旧身份模拟

**Files:**
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 配置浏览器请求和测试服务器令牌**

修改 `playwright.config.ts`：

```ts
const e2eAuthToken =
  process.env.E2E_TEST_AUTH_TOKEN ?? "cmcc-puzzle-hub-playwright-auth";

export default defineConfig({
  // 保留现有配置。
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    extraHTTPHeaders: {
      "x-e2e-auth-token": e2eAuthToken,
    },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      E2E_TEST_AUTH_TOKEN: e2eAuthToken,
    },
  },
});
```

- [ ] **Step 2: 删除旧 `/api/identity` 路由模拟**

从 `installApiMocks()` 删除：

```ts
await page.route("**/api/identity", async (route) => {
  await route.fulfill({ json: { publicId: CURRENT_PUBLIC_ID } });
});
```

- [ ] **Step 3: 运行聚焦 E2E 确认 GREEN**

Run: `pnpm test:e2e -- tests/e2e/hall-and-publish.spec.ts --project="430x932" --grep "大厅展示公开用户标识"`

Expected: 1 passed。

- [ ] **Step 4: 运行单视口完整业务文件**

Run: `pnpm test:e2e -- tests/e2e/hall-and-publish.spec.ts --project="430x932"`

Expected: 8 passed。

### Task 4: 完整验证并提交

**Files:**
- Verify: all modified files

- [ ] **Step 1: 运行完整 E2E**

Run: `pnpm test:e2e`

Expected: 24 passed，0 failed。

- [ ] **Step 2: 运行常规验证**

Run: `pnpm test:unit`

Expected: all unit tests passed。

Run: `pnpm typecheck`

Expected: exit code 0。

Run: `pnpm lint`

Expected: exit code 0。

Run: `pnpm build`

Expected: exit code 0。

Run: `git diff --check`

Expected: no output，exit code 0。

- [ ] **Step 3: 提交修复**

```bash
git add package.json scripts/run-e2e.mjs playwright.config.ts tests/e2e/hall-and-publish.spec.ts src/lib/testing/e2e-auth.ts src/lib/testing/e2e-auth.test.ts src/lib/supabase/server.ts src/proxy.ts docs/superpowers/specs/2026-08-06-e2e-auth-session-design.md docs/superpowers/plans/2026-08-06-e2e-auth-session.md
git commit -m "test: 修复账号体系下的E2E认证"
```
