# 帖子按北京时间月底过期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将赠送帖和求助帖的固定 24 小时有效期改为发布当月北京时间结束时统一过期。

**Architecture:** 新增纯日期函数，将当前时刻换算到 UTC+8 后计算次月 1 日北京时间零点对应的 UTC 时间。发布 Route Handler 继续通过现有仓储接口传递 ISO 格式的 `expiresAt`，数据库和 Cron 逻辑保持不变。

**Tech Stack:** TypeScript、Next.js 16 Route Handlers、Vitest、Supabase Postgres

---

### Task 1: 建立北京时间月底计算函数

**Files:**
- Create: `src/features/posts/domain/post-expiry.ts`
- Create: `src/features/posts/domain/post-expiry.test.ts`

- [ ] **Step 1: 写入日期边界失败测试**

创建 `src/features/posts/domain/post-expiry.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { getPostExpiresAt } from "./post-expiry";

describe("getPostExpiresAt", () => {
  it.each([
    ["普通月份", "2026-08-06T12:00:00.000Z", "2026-08-31T16:00:00.000Z"],
    ["月末最后一秒", "2026-08-31T15:59:59.999Z", "2026-08-31T16:00:00.000Z"],
    ["月界零点", "2026-08-31T16:00:00.000Z", "2026-09-30T16:00:00.000Z"],
    ["跨年", "2026-12-31T15:00:00.000Z", "2026-12-31T16:00:00.000Z"],
  ])("%s 计算北京时间次月一日零点", (_name, now, expected) => {
    expect(getPostExpiresAt(new Date(now)).toISOString()).toBe(expected);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/features/posts/domain/post-expiry.test.ts`

Expected: FAIL，提示无法解析 `./post-expiry`。

- [ ] **Step 3: 写入最小日期实现**

创建 `src/features/posts/domain/post-expiry.ts`：

```ts
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getPostExpiresAt(now = new Date()) {
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_UTC_OFFSET_MS);
  const nextMonthStartUtc = Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth() + 1,
    1,
  );

  return new Date(nextMonthStartUtc - SHANGHAI_UTC_OFFSET_MS);
}
```

- [ ] **Step 4: 运行日期测试确认通过**

Run: `pnpm vitest run src/features/posts/domain/post-expiry.test.ts`

Expected: PASS，4 个日期边界全部通过。

- [ ] **Step 5: 提交日期函数**

```bash
git add src/features/posts/domain/post-expiry.ts src/features/posts/domain/post-expiry.test.ts
git commit -m "feat: 添加帖子月底过期计算"
```

### Task 2: 发布接口使用月底到期时间

**Files:**
- Modify: `src/app/api/posts/route.test.ts`
- Modify: `src/app/api/posts/route.ts`

- [ ] **Step 1: 写入发布接口失败测试**

在 `route.test.ts` 的 Vitest import 中加入 `afterEach`，并在测试套件中加入：

```ts
afterEach(() => {
  vi.useRealTimers();
});

it("按北京时间月底设置帖子过期时间", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-31T15:30:00.000Z"));

  const response = await POST(request(baseInput));

  expect(response.status).toBe(201);
  expect(publishPost).toHaveBeenCalledWith(
    expect.objectContaining({
      expiresAt: "2026-08-31T16:00:00.000Z",
    }),
  );
});
```

- [ ] **Step 2: 运行接口测试确认失败**

Run: `pnpm vitest run src/app/api/posts/route.test.ts`

Expected: FAIL，现有固定 24 小时逻辑产生 `2026-09-01T15:30:00.000Z`。

- [ ] **Step 3: 接入日期函数**

从 `route.ts` 删除：

```ts
const POST_TTL_MS = 86_400_000;
```

导入并调用：

```ts
import { getPostExpiresAt } from "@/features/posts/domain/post-expiry";

const expiresAt = getPostExpiresAt();
```

保留现有 `expiresAt: expiresAt.toISOString()` 仓储参数。

- [ ] **Step 4: 运行日期与接口测试确认通过**

Run: `pnpm vitest run src/features/posts/domain/post-expiry.test.ts src/app/api/posts/route.test.ts`

Expected: PASS，日期边界和 Route Handler 发布行为全部通过。

- [ ] **Step 5: 提交接口调整**

```bash
git add src/app/api/posts/route.ts src/app/api/posts/route.test.ts
git commit -m "feat: 帖子改为北京时间月底过期"
```

### Task 3: 更新部署与业务说明

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新首页业务说明**

将 README 开头的：

```md
帖子 24 小时后自动过期
```

改为：

```md
帖子在发布当月结束时自动过期（北京时间次月 1 日 00:00）
```

保留求助助力后“24 小时自动确认”的独立说明。

- [ ] **Step 2: 检查过期文案没有混淆两种 24 小时规则**

Run: `rg -n "24 小时|24小时|月底|次月 1 日" README.md src docs/superpowers/specs/2026-08-06-month-end-post-expiry-design.md`

Expected: README 不再描述帖子固定 24 小时过期，求助收货确认仍明确为 24 小时。

- [ ] **Step 3: 提交文档更新**

```bash
git add README.md
git commit -m "docs: 更新帖子月底过期说明"
```

### Task 4: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 检查工作区格式**

Run: `git diff --check`

Expected: exit 0，无空白错误。

- [ ] **Step 2: 运行完整单元测试**

Run: `pnpm test:unit`

Expected: exit 0，所有单元测试通过。

- [ ] **Step 3: 运行类型检查与 Lint**

Run: `pnpm typecheck`

Expected: exit 0，无 TypeScript 错误。

Run: `pnpm lint`

Expected: exit 0，无 ESLint 错误。

- [ ] **Step 4: 运行生产构建**

Run: `pnpm build`

Expected: exit 0，Next.js 生产构建成功。

- [ ] **Step 5: 运行受影响的 E2E 发布流程**

Run: `pnpm test:e2e -- --grep "发布"`

Expected: exit 0，三个移动项目中的发布相关用例通过。
