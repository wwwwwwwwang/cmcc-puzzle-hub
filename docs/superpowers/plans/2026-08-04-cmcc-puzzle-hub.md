# 中国移动拼图互助平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个移动端优先的中国移动拼图互助 H5，支持口令/本地二维码发布、匿名设备约束、24 小时自动过期和单人原子领取。

**Architecture:** Next.js App Router 提供两个页面和三个 Route Handlers；共享领域解析器同时供客户端预览与服务端校验。Upstash Redis 使用独立详情键、筛选 ZSET、去重键和 Lua 脚本，确保发布 TTL 与领取并发一致性；浏览器使用持久化 FingerprintJS 标识关联匿名操作。

**Tech Stack:** Next.js、React、TypeScript、Tailwind CSS、shadcn/ui、Framer Motion、jsQR、FingerprintJS、Upstash Redis、Zod、Vitest、Testing Library、Playwright、pnpm。

---

## 文件结构

计划创建或修改以下文件；实现时保持这些职责边界，不把 Redis、解析或设备哈希逻辑放进 React 页面：

```text
.
├── .env.example
├── .github/workflows/ci.yml
├── .gitignore
├── README.md
├── package.json
├── playwright.config.ts
├── vitest.config.ts
├── vitest.integration.config.ts
├── vitest.setup.ts
├── scripts/generate-qr-fixture.mjs
├── tests
│   ├── e2e/hall-and-publish.spec.ts
│   └── fixtures
│       ├── cmcc-samples.ts
│       └── give-url-qr.png
└── src
    ├── app
    │   ├── api/posts/route.ts
    │   ├── api/posts/[id]/claim/route.ts
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── publish/page.tsx
    ├── components
    │   ├── app-shell.tsx
    │   ├── bottom-nav.tsx
    │   └── providers.tsx
    └── features/posts
        ├── components
        │   ├── claim-drawer.tsx
        │   ├── post-card.tsx
        │   ├── post-feed.tsx
        │   ├── post-filters.tsx
        │   ├── publish-panel.tsx
        │   ├── puzzle-board.tsx
        │   └── qr-image-picker.tsx
        ├── device
        │   ├── client.ts
        │   ├── device-provider.tsx
        │   └── hash.ts
        ├── domain
        │   ├── errors.ts
        │   ├── parse-command.ts
        │   ├── parse-source.ts
        │   ├── parse-url.ts
        │   ├── schemas.ts
        │   └── types.ts
        └── server
            ├── claim-script.ts
            ├── keys.ts
            ├── post-repository.ts
            ├── rate-limit.ts
            └── redis.ts
```

测试文件与被测模块同目录放置，使用 `*.test.ts`、`*.test.tsx` 和 `*.integration.test.ts` 后缀。

### Task 1: 初始化项目与质量工具链

**Files:**
- Create: `package.json`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `vitest.config.ts`
- Create: `vitest.integration.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: 在现有目录中生成 Next.js App Router 骨架**

由于当前目录已包含需求与设计文档，先在工作区内的临时子目录生成骨架，再把生成文件移入项目根目录：

```powershell
pnpm dlx create-next-app@latest cmcc-puzzle-hub-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack --yes --disable-git
Get-ChildItem -Force 'cmcc-puzzle-hub-scaffold' | Move-Item -Destination '.'
Remove-Item -LiteralPath 'cmcc-puzzle-hub-scaffold' -Force
git init -b main
```

Expected: `项目需求文档.md` 和 `docs/` 保持不变，根目录新增可运行的 Next.js 项目并初始化 Git。执行移动前必须确认临时目录的解析绝对路径为 `F:\cursor\cmcc-puzzle-hub\cmcc-puzzle-hub-scaffold`，且根目录没有与骨架同名的业务文件。

- [ ] **Step 2: 安装产品依赖和测试依赖**

Run:

```powershell
pnpm add @fingerprintjs/fingerprintjs @upstash/ratelimit @upstash/redis framer-motion jsqr server-only zod
pnpm add -D @playwright/test @testing-library/jest-dom @testing-library/react @testing-library/user-event @types/jsqr jsdom qrcode vite-tsconfig-paths vitest
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button drawer input skeleton tabs textarea
```

Expected: lockfile 固定全部依赖，shadcn 组件进入 `src/components/ui/`。

- [ ] **Step 3: 增加测试与类型检查脚本**

Modify `package.json` scripts to contain:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run --exclude '**/*.integration.test.*'",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit"
  }
}
```

- [ ] **Step 4: 配置 Vitest 与 Playwright**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    clearMocks: true,
  },
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 20_000,
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "mobile-375", use: { ...devices["iPhone SE"] } },
    { name: "mobile-390", use: { ...devices["iPhone 13"] } },
    { name: "mobile-430", use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
  ],
});
```

- [ ] **Step 5: 验证干净骨架并提交**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm build
git add package.json pnpm-lock.yaml src components.json eslint.config.mjs postcss.config.mjs tsconfig.json vitest.config.ts vitest.integration.config.ts vitest.setup.ts playwright.config.ts
git commit -m "chore: scaffold mobile puzzle hub"
```

Expected: 三个检查命令退出码均为 0，产生首个工程提交。

### Task 2: 定义领域类型、输入 Schema 与真实样本

**Files:**
- Create: `src/features/posts/domain/types.ts`
- Create: `src/features/posts/domain/schemas.ts`
- Create: `src/features/posts/domain/schemas.test.ts`
- Create: `tests/fixtures/cmcc-samples.ts`

- [ ] **Step 1: 写选择范围的失败测试**

Create `src/features/posts/domain/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPostInputSchema } from "./schemas";

describe("createPostInputSchema", () => {
  it.each([
    [{ discount: 95, pieceNumber: 5 }],
    [{ discount: 90, pieceNumber: 7 }],
    [{ discount: 80, pieceNumber: 10 }],
  ])("拒绝越界选择 %o", (selection) => {
    const result = createPostInputSchema.safeParse({
      selection,
      source: { kind: "COMMAND", value: "￥19uSvG￥" },
      visitorId: "device-visitor-id",
    });
    expect(result.success).toBe(false);
  });

  it("接受 8 折 9 号", () => {
    expect(createPostInputSchema.safeParse({
      selection: { discount: 80, pieceNumber: 9 },
      source: { kind: "COMMAND", value: "￥19uSvG￥" },
      visitorId: "device-visitor-id",
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块缺失失败**

Run: `pnpm vitest run src/features/posts/domain/schemas.test.ts`

Expected: FAIL，提示无法解析 `./schemas`。

- [ ] **Step 3: 实现稳定领域类型和 Zod 边界**

Create `src/features/posts/domain/types.ts`:

```ts
export type PostType = "GIVE" | "REQUEST";
export type Discount = 95 | 90 | 80;
export type PayloadKind = "COMMAND" | "URL";

export type PuzzleSelection = { discount: Discount; pieceNumber: number };
export type ParsedSource = {
  type: PostType;
  payloadKind: PayloadKind;
  payload: string;
  explicitSelection: PuzzleSelection | null;
};

export type HallPostDto = PuzzleSelection & {
  id: string;
  type: PostType;
  payloadKind: PayloadKind;
  createdAt: string;
  expiresAt: string;
};

export type StoredPost = HallPostDto & {
  payload: string;
  publisherDeviceHash: string;
  payloadHash: string;
};
```

Create `src/features/posts/domain/schemas.ts`:

```ts
import { z } from "zod";

const selectionSchema = z.object({
  discount: z.union([z.literal(95), z.literal(90), z.literal(80)]),
  pieceNumber: z.number().int().positive(),
}).superRefine(({ discount, pieceNumber }, ctx) => {
  const max = discount === 95 ? 4 : discount === 90 ? 6 : 9;
  if (pieceNumber > max) ctx.addIssue({ code: "custom", message: "拼图编号超出折扣范围", path: ["pieceNumber"] });
});

export const createPostInputSchema = z.object({
  selection: selectionSchema,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("COMMAND"), value: z.string().trim().min(1).max(1000) }),
    z.object({ kind: z.literal("URL"), value: z.string().trim().min(1).max(4096) }),
  ]),
  visitorId: z.string().trim().min(8).max(256),
});

export const claimPostInputSchema = z.object({ visitorId: z.string().trim().min(8).max(256) });
export type CreatePostInput = z.infer<typeof createPostInputSchema>;
```

- [ ] **Step 4: 保存 PRD 的四条完整样本**

Create `tests/fixtures/cmcc-samples.ts`，逐字复制 `项目需求文档.md` 中的 `GIVE_COMMAND`、`REQUEST_COMMAND`、`GIVE_URL`、`REQUEST_URL` 四个字符串，并导出为命名常量；不得缩短 URL 或改写中文标点。

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run src/features/posts/domain/schemas.test.ts`

Expected: PASS，4 个用例通过。

```powershell
git add src/features/posts/domain tests/fixtures/cmcc-samples.ts
git commit -m "feat: define puzzle post domain"
```

### Task 3: 以真实样本驱动口令与 URL 解析器

**Files:**
- Create: `src/features/posts/domain/errors.ts`
- Create: `src/features/posts/domain/parse-command.ts`
- Create: `src/features/posts/domain/parse-command.test.ts`
- Create: `src/features/posts/domain/parse-url.ts`
- Create: `src/features/posts/domain/parse-url.test.ts`
- Create: `src/features/posts/domain/parse-source.ts`

- [ ] **Step 1: 写口令解析失败测试**

Create `parse-command.test.ts`，至少包含以下断言：

```ts
import { describe, expect, it } from "vitest";
import { GIVE_COMMAND, REQUEST_COMMAND } from "../../../../tests/fixtures/cmcc-samples";
import { DomainError } from "./errors";
import { parseCommand } from "./parse-command";

describe("parseCommand", () => {
  it("解析赠送样本", () => expect(parseCommand(GIVE_COMMAND)).toEqual({
    type: "GIVE", payloadKind: "COMMAND", payload: "￥19uSvG￥",
    explicitSelection: { discount: 80, pieceNumber: 6 },
  }));
  it("解析索求样本", () => expect(parseCommand(REQUEST_COMMAND)).toEqual({
    type: "REQUEST", payloadKind: "COMMAND", payload: "￥19uSvR￥",
    explicitSelection: { discount: 80, pieceNumber: 1 },
  }));
  it.each(["无密钥的文本", "￥a￥ 与 ￥b￥", "送你一张，还差一张‘8折1号拼图’，￥x￥"])(
    "拒绝歧义输入 %s", (value) => expect(() => parseCommand(value)).toThrow(DomainError),
  );
});
```

- [ ] **Step 2: 运行口令测试确认失败**

Run: `pnpm vitest run src/features/posts/domain/parse-command.test.ts`

Expected: FAIL，解析器模块尚不存在。

- [ ] **Step 3: 实现口令解析器**

Create `errors.ts` with `DomainError` carrying `INVALID_CONTENT` or `SELECTION_MISMATCH`。在 `parse-command.ts` 中依次执行：匹配唯一 `/￥[^￥\s]+￥/g`；以互斥短语识别 `GIVE`/`REQUEST`；用中文/英文引号兼容正则提取 `(95折|9折|8折)([1-9])号拼图`；将折扣映射为 `95 | 90 | 80`；按 4/6/9 上限校验编号；返回 `ParsedSource`。任何缺失或冲突都抛 `new DomainError("INVALID_CONTENT", "口令内容无法唯一识别")`。

- [ ] **Step 4: 写 URL 解析失败测试**

Create `parse-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GIVE_URL, REQUEST_URL } from "../../../../tests/fixtures/cmcc-samples";
import { parseCmccUrl } from "./parse-url";

describe("parseCmccUrl", () => {
  it("解析赠送 URL", () => expect(parseCmccUrl(GIVE_URL)).toMatchObject({
    type: "GIVE", payloadKind: "URL", payload: GIVE_URL, explicitSelection: null,
  }));
  it("解析索求 URL", () => expect(parseCmccUrl(REQUEST_URL)).toMatchObject({
    type: "REQUEST", payloadKind: "URL", payload: REQUEST_URL, explicitSelection: null,
  }));
  it.each([
    "http://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html",
    "https://evil.example/activity/zx/transit/transferDownload.html?targetUrl=https%3A%2F%2Fwx.10086.cn%2Fhlwyxhdhub%2Fact-wedrecharge%2F1%3FgiveCard%3Dx",
  ])("拒绝非白名单 URL %s", (value) => expect(() => parseCmccUrl(value)).toThrow());
});
```

- [ ] **Step 5: 实现双层 URL 白名单和统一入口**

`parse-url.ts` 使用标准 `URL` API，精确校验外层 `https:`、主机、路径；解析 `targetUrl` 后精确校验内层主机，路径匹配 `/^\/hlwyxhdhub\/act-wedrecharge\/\d+$/`；`giveCard` 与 `requestCard` 必须二选一。`parse-source.ts` 根据 `source.kind` 调用对应解析器，并在口令 `explicitSelection` 与宫格不一致时抛 `SELECTION_MISMATCH`；URL 只验证宫格自身范围。

- [ ] **Step 6: 运行全部领域测试并提交**

Run: `pnpm vitest run src/features/posts/domain`

Expected: PASS，真实四样本和恶意输入均覆盖。

```powershell
git add src/features/posts/domain
git commit -m "feat: parse cmcc commands and links"
```

### Task 4: 实现持久匿名设备身份与服务端 HMAC

**Files:**
- Create: `src/features/posts/device/client.ts`
- Create: `src/features/posts/device/client.test.ts`
- Create: `src/features/posts/device/device-provider.tsx`
- Create: `src/features/posts/device/hash.ts`
- Create: `src/features/posts/device/hash.test.ts`
- Create: `src/components/providers.tsx`

- [ ] **Step 1: 写持久缓存与 HMAC 测试**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPersistentVisitorId } from "./client";

describe("getPersistentVisitorId", () => {
  beforeEach(() => localStorage.clear());
  it("优先复用本地标识", async () => {
    localStorage.setItem("cmcc-puzzle-device-id", "cached-device-id");
    const loader = vi.fn();
    await expect(getPersistentVisitorId(loader)).resolves.toBe("cached-device-id");
    expect(loader).not.toHaveBeenCalled();
  });
  it("首次使用 FingerprintJS 并缓存", async () => {
    await expect(getPersistentVisitorId(async () => "fingerprint-device-id")).resolves.toBe("fingerprint-device-id");
    expect(localStorage.getItem("cmcc-puzzle-device-id")).toBe("fingerprint-device-id");
  });
});
```

`hash.test.ts` 使用固定 secret 和 visitorId，断言相同输入摘要稳定、不同 visitorId 摘要不同且原文不出现在结果中。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/features/posts/device`

Expected: FAIL，身份模块不存在。

- [ ] **Step 3: 实现客户端身份服务和 Provider**

`client.ts` 导出 `DEVICE_STORAGE_KEY`、默认 FingerprintJS loader 和可注入 loader 的 `getPersistentVisitorId`。`device-provider.tsx` 在客户端暴露 `{ visitorId, status, retry }`，状态为 `loading | ready | error`；已有 localStorage 缓存时不加载 FingerprintJS，没有缓存且加载失败时不得生成随机替代值。

- [ ] **Step 4: 实现仅服务端可用的 HMAC**

`hash.ts` 顶部引入 `server-only`，读取非空 `DEVICE_HASH_SECRET`，使用 Node `createHmac("sha256", secret).update(visitorId).digest("hex")`。环境变量缺失时抛配置错误，日志不得包含 visitorId。

- [ ] **Step 5: 挂载 Provider 并验证**

`src/components/providers.tsx` 只组合 `DeviceIdentityProvider`；在根 `layout.tsx` 包裹页面内容。

Run: `pnpm vitest run src/features/posts/device`

Expected: PASS。

```powershell
git add src/features/posts/device src/components/providers.tsx src/app/layout.tsx
git commit -m "feat: add persistent anonymous device identity"
```

### Task 5: 实现 Redis 键、发布事务与大厅查询

**Files:**
- Create: `src/features/posts/server/redis.ts`
- Create: `src/features/posts/server/keys.ts`
- Create: `src/features/posts/server/post-repository.ts`
- Create: `src/features/posts/server/post-repository.integration.test.ts`
- Create: `src/features/posts/server/rate-limit.ts`

- [ ] **Step 1: 写 Redis 发布集成测试**

测试使用 `TEST_REDIS_PREFIX` 加随机 UUID 隔离键，覆盖：发布后 `post:{id}` TTL 在 86390-86400 秒；四个索引均包含 ID；同一 `payloadHash` 第二次发布返回 `DUPLICATE_POST`；列表 DTO 不含 `payload`、`publisherDeviceHash` 和 `payloadHash`；筛选能区分类型和折扣。测试结束只删除本次随机前缀下的显式键。

- [ ] **Step 2: 运行集成测试确认失败**

Run: `pnpm vitest run src/features/posts/server/post-repository.integration.test.ts`

Expected: FAIL，仓储模块不存在；若没有测试 Upstash 凭证，测试以明确的 `describe.skip` 原因跳过，不能连接生产库。

- [ ] **Step 3: 实现 Redis 客户端和键生成器**

`redis.ts` 使用 `Redis.fromEnv()` 单例。`keys.ts` 导出纯函数：`postKey(id)`、`dedupeKey(hash)`、`claimKey(id)`、`allIndexKey()`、`typeIndexKey(type)`、`discountIndexKey(discount)`、`typeDiscountIndexKey(type, discount)`；所有函数接受可选测试前缀。

发布 ID 格式固定为 `p_<expiresAtMillis>_<randomUUID>`。路径参数解析器必须校验完整格式；当详情与回执都不存在时，仓储通过 ID 内的过期时间稳定区分 `EXPIRED` 和 `ALREADY_CLAIMED`，不依赖客户端时间参数。

- [ ] **Step 4: 实现原子发布**

在 `post-repository.ts` 内使用 Lua：先检查去重键；成功时 `SET post EX 86400`、`SET dedupe NX EX 86400`，再向全量、类型、折扣、类型+折扣四个 ZSET 写入相同时间戳和 ID。Lua 返回 `CREATED` 或 `DUPLICATE`，避免详情与索引部分成功。

- [ ] **Step 5: 实现安全分页查询和惰性清理**

按筛选条件选择一个 ZSET，每批读取最多 40 个倒序 ID，通过 `MGET` 获取详情，丢弃已过期空值并 `ZREM` 孤立 ID；收集到 20 条或索引耗尽后停止。游标编码 `{ score, id }` 为 base64url，并在同分值时用 ID 稳定去重。映射响应时显式挑选 `HallPostDto` 字段。

- [ ] **Step 6: 实现发布限流**

`rate-limit.ts` 使用 `Ratelimit.slidingWindow(Number(process.env.PUBLISH_LIMIT_PER_HOUR ?? 10), "1 h")`，identifier 只接受 `deviceHash`。返回 `{ success, reset }`，API 将失败映射为 429。

- [ ] **Step 7: 验证并提交**

Run:

```powershell
pnpm vitest run src/features/posts/server/post-repository.integration.test.ts
pnpm typecheck
git add src/features/posts/server
git commit -m "feat: persist expiring puzzle posts"
```

Expected: 有测试凭证时集成测试 PASS；无凭证时只有带原因的 SKIP，类型检查 PASS。

### Task 6: 实现并发安全与幂等领取

**Files:**
- Create: `src/features/posts/server/claim-script.ts`
- Modify: `src/features/posts/server/post-repository.ts`
- Create: `src/features/posts/server/claim.integration.test.ts`

- [ ] **Step 1: 写并发领取失败测试**

测试先发布一条记录，再用两个不同 `deviceHash` 并发执行 `Promise.allSettled([claimPost(...), claimPost(...)])`，断言恰好一个结果含载荷、另一个为 `ALREADY_CLAIMED`；随后断言详情键不存在、四个索引均无 ID、去重键仍存在。

- [ ] **Step 2: 写自领与幂等失败测试**

断言发布者领取得到 `SELF_CLAIM_FORBIDDEN` 且记录仍在；非发布者成功领取后，同一设备 5 分钟内重试仍得到相同载荷，第三个设备不能得到载荷；领取回执 TTL 在 290-300 秒。

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run src/features/posts/server/claim.integration.test.ts`

Expected: FAIL，`claimPost` 尚不存在。

- [ ] **Step 4: 编写 Lua 脚本和结果解析**

`claim-script.ts` 导出一个 Lua 字符串，按此顺序执行：读取 `claim:{id}` 并只向同设备返回；读取 `post:{id}`；拒绝自领；写入含 `claimantDeviceHash/payloadKind/payload` 的 300 秒回执；删除详情；从四个索引移除；返回 JSON 状态。`post-repository.ts` 将 Lua 状态穷举映射为 TypeScript 联合类型，不使用字符串消息推断。

- [ ] **Step 5: 运行并发测试 20 次排除偶现问题**

Run:

```powershell
1..20 | ForEach-Object { pnpm vitest run src/features/posts/server/claim.integration.test.ts }
```

Expected: 20 次全部 PASS，无一次双领取。

- [ ] **Step 6: 提交**

```powershell
git add src/features/posts/server/claim-script.ts src/features/posts/server/post-repository.ts src/features/posts/server/claim.integration.test.ts
git commit -m "feat: claim puzzle posts atomically"
```

### Task 7: 实现发布、列表与领取 API

**Files:**
- Create: `src/app/api/posts/route.ts`
- Create: `src/app/api/posts/route.test.ts`
- Create: `src/app/api/posts/[id]/claim/route.ts`
- Create: `src/app/api/posts/[id]/claim/route.test.ts`

- [ ] **Step 1: 写发布和列表 Route Handler 测试**

使用 `vi.mock` 隔离 Redis、限流和 HMAC，覆盖：四条真实样本发布成功；口令宫格不一致返回 400/`SELECTION_MISMATCH`；恶意 URL 返回 400/`INVALID_CONTENT`；重复返回 409；超限返回 429；GET 参数非法返回 400；GET 只透传安全 DTO。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/app/api/posts/route.test.ts`

Expected: FAIL，Route Handler 尚不存在。

- [ ] **Step 3: 实现 `GET` 与 `POST /api/posts`**

`POST` 顺序固定为：解析 JSON → Zod 校验 → HMAC visitorId → 限流 → 共享解析器 → SHA-256 规范化载荷 → 构造 24 小时时间戳 → 仓储原子发布 → 安全 DTO。`GET` 校验 type/discount/cursor/limit 后调用仓储。两者通过统一 `jsonError(code, status, field?)` 返回规格中的错误结构；日志只记录错误码和请求 ID。

- [ ] **Step 4: 写领取 Route Handler 测试**

覆盖 visitorId 无效、ID 格式无效、自领 403、已领取 409、过期 404、Redis 不可用 503、成功返回 COMMAND/URL 载荷，以及同设备幂等结果仍为 200。

- [ ] **Step 5: 实现 `POST /api/posts/[id]/claim`**

先校验路径 ID 和请求体，再 HMAC visitorId 并调用 `claimPost`；仅成功或同设备回执响应包含载荷。对其他状态使用规格中的稳定错误码，响应头设置 `Cache-Control: no-store`。

- [ ] **Step 6: 验证并提交**

Run: `pnpm vitest run src/app/api/posts`

Expected: PASS。

```powershell
git add src/app/api
git commit -m "feat: expose puzzle post APIs"
```

### Task 8: 构建移动端应用外壳与宫格选择器

**Files:**
- Create: `src/components/app-shell.tsx`
- Create: `src/components/bottom-nav.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/features/posts/components/puzzle-board.tsx`
- Create: `src/features/posts/components/puzzle-board.test.tsx`

- [ ] **Step 1: 写宫格行为测试**

用 Testing Library 断言默认 8 折显示 9 块；选择 6 号只高亮一块；切换 95 折后显示 4 块并清除旧选择；切换 9 折显示 6 块；每块按钮有可访问名称“8折6号拼图”。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/features/posts/components/puzzle-board.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现固定尺寸宫格**

`PuzzleBoard` 接收 `{ discount, value, onChange }`，根据折扣映射列数和数量。每块使用 `aspect-square`，选中态为科技蓝；Framer Motion 只改变 `scale`/`y`，不得改变网格轨道尺寸；尊重 `prefers-reduced-motion`。

- [ ] **Step 4: 实现应用外壳与底栏**

`AppShell` 使用 `min-h-dvh w-full max-w-md mx-auto bg-white`，外层页面为浅灰；`BottomNav` 只含大厅与发布，使用 Lucide `House`、`Plus`，依据 pathname 设置活动态。内容区使用 `pb-[calc(4rem+env(safe-area-inset-bottom))]`，底栏包含相同安全区。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
pnpm vitest run src/features/posts/components/puzzle-board.test.tsx
pnpm lint
pnpm typecheck
git add src/app src/components src/features/posts/components/puzzle-board*
git commit -m "feat: add mobile shell and puzzle board"
```

Expected: 全部 PASS。

### Task 9: 实现本地二维码解析与双轨发布页

**Files:**
- Create: `src/features/posts/components/qr-image-picker.tsx`
- Create: `src/features/posts/components/qr-image-picker.test.tsx`
- Create: `src/features/posts/components/publish-panel.tsx`
- Create: `src/features/posts/components/publish-panel.test.tsx`
- Create: `src/app/publish/page.tsx`

- [ ] **Step 1: 写二维码隐私边界测试**

注入假的 `decodeImage`，选择 PNG 后断言只把 `File` 交给本地解码函数、没有调用 `fetch`；非图片、大于 10MB、无二维码和二维码内容不是白名单 URL 分别显示明确错误。

- [ ] **Step 2: 实现本地图片解码**

`QrImagePicker` 使用隐藏的 `accept="image/*"` 文件输入和可访问按钮；通过 object URL 加载 `Image`，绘制到内存 Canvas，调用 `jsQR(imageData.data, width, height)`，在 `finally` 撤销 object URL。函数不得接收上传地址，不构造 FormData。

- [ ] **Step 3: 写发布面板状态测试**

覆盖：无宫格选择时 textarea/图片按钮禁用；粘贴真实赠送口令显示“8折6号·赠送”；选择 8折1号再粘贴该口令显示不一致且不请求 API；发布失败保留输入；成功清空并导航大厅。

- [ ] **Step 4: 实现发布面板与页面**

`PublishPanel` 对口令使用共享解析器即时预览，对图片使用 `QrImagePicker` 后调用 URL 解析器；提交体严格匹配 `CreatePostInput`。身份未 ready 时按钮显示加载；提交中防重复；API 错误码映射为中文提示。`publish/page.tsx` 组合折扣 Tabs、`PuzzleBoard` 和面板。

- [ ] **Step 5: 验证并提交**

Run:

```powershell
pnpm vitest run src/features/posts/components/qr-image-picker.test.tsx src/features/posts/components/publish-panel.test.tsx
pnpm typecheck
git add src/features/posts/components src/app/publish/page.tsx
git commit -m "feat: publish commands and local qr links"
```

Expected: PASS，网络 spy 证明图片不上传。

### Task 10: 实现大厅、筛选和领取抽屉

**Files:**
- Create: `src/features/posts/components/post-filters.tsx`
- Create: `src/features/posts/components/post-card.tsx`
- Create: `src/features/posts/components/post-feed.tsx`
- Create: `src/features/posts/components/claim-drawer.tsx`
- Create: `src/features/posts/components/claim-drawer.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 写领取交互失败测试**

覆盖：点击卡片只打开抽屉且未请求 API；取消不请求；确认后才请求；COMMAND 成功先调用 `navigator.clipboard.writeText("￥19uSvG￥")` 再调用注入的 `launchApp("leadeon://")`；复制失败时不调用 launch；所有口令结果都显示“若未自动跳转，请手动打开中国移动 APP”和“再次唤起”。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/features/posts/components/claim-drawer.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现领取抽屉**

使用 shadcn Drawer；确认按钮调用 claim API。URL 结果只给白名单 URL 赋值 `window.location.href`；COMMAND 结果执行剪贴板成功后调用 `leadeon://`。`ALREADY_CLAIMED` 通知父组件移除卡片，`SELF_CLAIM_FORBIDDEN` 保留卡片，网络错误允许原地重试。

- [ ] **Step 4: 实现大厅数据流和筛选**

`PostFilters` 把 type/discount 写入 URLSearchParams；`PostFeed` 使用 opaque cursor 加载 20 条、筛选变化时取消旧请求并重置列表，渲染骨架、空状态、错误重试和“加载更多”。`PostCard` 只接收 `HallPostDto`，不得声明 payload 属性。

- [ ] **Step 5: 组装默认大厅并验证**

`src/app/page.tsx` 首屏直接渲染标题、筛选和信息流，不增加营销 Hero。

Run:

```powershell
pnpm vitest run src/features/posts/components
pnpm lint
pnpm typecheck
git add src/features/posts/components src/app/page.tsx
git commit -m "feat: browse and claim puzzle posts"
```

Expected: 所有组件测试 PASS。

### Task 11: 增加端到端、移动视觉与隐私回归

**Files:**
- Create: `scripts/generate-qr-fixture.mjs`
- Create: `tests/fixtures/give-url-qr.png`
- Create: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 生成固定二维码图片**

Create `scripts/generate-qr-fixture.mjs`；脚本使用 `qrcode.toFile(outputPath, GIVE_URL, { width: 512, margin: 2 })`，其中 `GIVE_URL` 是 `项目需求文档.md` 中赠送链接完整版的逐字字符串，`outputPath` 通过 `fileURLToPath(new URL("../tests/fixtures/give-url-qr.png", import.meta.url))` 解析。脚本只在 fixture 变更时运行，测试不依赖外网或 TypeScript loader。

Run: `node scripts/generate-qr-fixture.mjs`

Expected: 生成可被 jsQR 解码的 PNG。

- [ ] **Step 2: 写口令闭环 E2E**

Playwright 拦截三个 API 并返回确定数据：进入发布页，选择 8折6号，粘贴真实赠送口令，提交后回到大厅；点击领取、确认，模拟 COMMAND 结果；断言剪贴板包含 `￥19uSvG￥`，页面保留手动打开 APP 提示。对自定义 Scheme 使用注入 launcher spy，不让测试浏览器实际导航。

- [ ] **Step 3: 写二维码隐私 E2E**

上传 `give-url-qr.png`，等待本地预览，再提交；记录页面产生的所有请求体和 Content-Type，断言不存在图片字节、data URL 或 multipart 上传，只有 JSON 中的解析 URL。

- [ ] **Step 4: 写三视口布局检查**

对 375x667、390x844、430x932 分别断言 `document.documentElement.scrollWidth <= window.innerWidth`；打开发布面板和领取抽屉后重复断言；保存失败时截图，检查底栏、按钮和文字没有互相遮挡。

- [ ] **Step 5: 运行并提交**

Run:

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
git add scripts tests/e2e tests/fixtures/give-url-qr.png
git commit -m "test: cover mobile sharing workflows"
```

Expected: 三个移动项目全部 PASS，隐私断言未发现图片上传。

### Task 12: 配置环境、CI、部署说明与最终门禁

**Files:**
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: 写环境变量模板和忽略规则**

Create `.env.example`:

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DEVICE_HASH_SECRET=
PUBLISH_LIMIT_PER_HOUR=10
```

在 `.gitignore` 增加 `.env*`、`!.env.example`、`.superpowers/`、`test-results/`、`playwright-report/`，确保本地密钥被忽略而模板可提交。

- [ ] **Step 2: 配置 GitHub Actions**

Create `.github/workflows/ci.yml`，使用 Node 当前 LTS、`pnpm/action-setup` 和 pnpm cache，顺序运行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm build`、安装 Chromium、`pnpm test:e2e`。仅在配置 `TEST_UPSTASH_REDIS_REST_URL/TOKEN` secrets 时运行 `pnpm test:integration`，并使用独立随机前缀。

- [ ] **Step 3: 编写运行和真机验收说明**

`README.md` 说明：安装与启动命令、Upstash/Vercel 配置、默认每小时 10 条、24 小时 TTL、FingerprintJS 局限、二维码不上传、Android/iPhone 的剪贴板与 `leadeon://` 验收步骤，以及未安装 APP 时应看到的手动打开提示。

- [ ] **Step 4: 执行完整自动化门禁**

Run each command separately:

```powershell
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
git diff --check
```

Expected: lint、类型、单元、构建、E2E 与 diff 检查全部 PASS；集成测试在有专用凭证时 PASS，无凭证时明确 SKIP。

- [ ] **Step 5: 执行人工真机门禁**

在至少一台 Android 和一台 iPhone 上：发布真实测试口令；另一设备领取；确认剪贴板写入；确认 `leadeon://` 拉起中国移动 APP；确认客户端识别口令；在未安装/未唤起场景看到“若未自动跳转，请手动打开中国移动 APP”。记录设备、系统、浏览器和结果到发布说明。

- [ ] **Step 6: 提交交付配置**

```powershell
git add .env.example .github/workflows/ci.yml .gitignore README.md
git commit -m "chore: prepare vercel delivery"
git status --short
```

Expected: 提交成功，`git status --short` 无未跟踪或未提交的项目文件。

## 需求覆盖矩阵

| 需求 | 实施任务 | 自动化证据 |
|---|---|---|
| 4/6/9 宫格与前置选择 | Task 8、9 | PuzzleBoard/PublishPanel 组件测试 |
| 口令真实样本解析 | Task 2、3 | parser 单元测试 |
| 二维码本地解析且不上传 | Task 3、9、11 | URL 单测、网络拦截 E2E |
| FingerprintJS 持久 Device ID | Task 4 | localStorage 与 loader 单测 |
| 发布限流、去重、禁止自领 | Task 5、6、7 | Redis 集成与 API 测试 |
| Redis 86400 秒 TTL | Task 5 | TTL 集成断言 |
| 大厅筛选与安全 DTO | Task 5、7、10 | 仓储、API、组件测试 |
| 首位领取后原子下架 | Task 6、7 | 20 轮并发集成测试 |
| 复制口令并调用 leadeon:// | Task 10、11 | 组件与 E2E 测试 |
| 跳转失败手动打开提示 | Task 10、11、12 | UI 测试与真机门禁 |
| 移动端蓝白界面和动效 | Task 8-11 | 三视口 E2E 与截图 |
| Vercel/Upstash/CI | Task 12 | build、workflow、环境模板 |
