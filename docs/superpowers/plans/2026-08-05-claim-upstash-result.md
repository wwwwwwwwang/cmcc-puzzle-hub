# 领取接口 Upstash 返回值兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Upstash 自动反序列化领取 Lua 返回值后被仓储层误判并导致线上 503 的问题。

**Architecture:** 保持 Redis 客户端默认配置和 Lua 返回协议不变，在 `parseClaimResult` 边界统一处理 JSON 字符串与已解析对象。复用现有结构校验，确保未知状态和畸形载荷仍然失败。

**Tech Stack:** Next.js 16.3、TypeScript、Vitest、`@upstash/redis`

---

### Task 1: 复现 Upstash 自动反序列化结果

**Files:**
- Modify: `src/features/posts/server/post-repository.test.ts`

- [ ] **Step 1: 写入失败测试**

在 `claimPost` 测试组中新增：

```ts
it("解析 Upstash 自动反序列化后的对象结果", async () => {
  const redis = createRedis({
    eval: vi.fn(async () => ({
      status: "CLAIMED",
      payloads: basePost.payloads,
      idempotent: false,
    })),
  });

  await expect(claimPost(postId, "claimant-hash", { redis })).resolves.toEqual({
    status: "CLAIMED",
    payloads: basePost.payloads,
    idempotent: false,
  });
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `pnpm exec vitest run src/features/posts/server/post-repository.test.ts`

Expected: 新增测试失败，错误信息包含 `Invalid claim script result`。

### Task 2: 兼容字符串和对象结果

**Files:**
- Modify: `src/features/posts/server/post-repository.ts`
- Test: `src/features/posts/server/post-repository.test.ts`

- [ ] **Step 1: 实现最小兼容解析**

将 `parseClaimResult` 的开头调整为：

```ts
function parseClaimResult(value: unknown): ClaimPostResult {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Invalid claim script result");
    }
  }

  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    throw new Error("Invalid claim script result");
  }
```

其余状态与载荷校验保持不变。

- [ ] **Step 2: 运行目标测试并确认通过**

Run: `pnpm exec vitest run src/features/posts/server/post-repository.test.ts`

Expected: 目标测试文件全部通过。

- [ ] **Step 3: 运行完整验证**

Run: `pnpm test:unit`

Expected: 全部单元测试通过。

Run: `pnpm typecheck`

Expected: Next.js 类型生成和 TypeScript 检查通过。

Run: `pnpm build`

Expected: Next.js 生产构建成功。

- [ ] **Step 4: 检查差异并提交**

Run: `git diff --check`

Expected: 无空白错误。

```powershell
git add -- 'src/features/posts/server/post-repository.ts' 'src/features/posts/server/post-repository.test.ts' 'docs/superpowers/plans/2026-08-05-claim-upstash-result.md'
git commit -m "fix: 兼容 Upstash 领取结果自动解析"
```

提交后推送当前 `main` 分支，由 Vercel 触发生产部署。
