# 双来源拼图发布与领取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将拼图帖子从单一口令/链接来源扩展为可保存一种或两种来源，并让领取者在领取前选择口令或链接。

**Architecture:** 保留现有 Next.js App Router、Redis Lua 原子操作和匿名设备模型。领域层把两个来源解析为统一的帖子选择与类型；Redis 显式保存 `payloads` 和 `payloadHashes`；客户端发布页用两个保留状态的标签，领取抽屉用两个动作按钮消费同一条帖子并在成功响应后执行用户选择的方式。

**Tech Stack:** Next.js 16、React、TypeScript、Zod、Upstash Redis、Vitest、Testing Library、Playwright、pnpm。

---

## 文件地图

- `src/features/posts/domain/types.ts`：双来源和大厅可用来源类型。
- `src/features/posts/domain/schemas.ts`：`sources` 至少有一种来源的校验。
- `src/features/posts/domain/parse-source.ts`：双来源一致性解析。
- `src/features/posts/domain/parse-sources.test.ts`：双来源解析测试。
- `src/features/posts/server/post-repository.ts`：双载荷存储、去重、列表 DTO、领取结果和旧结构兼容。
- `src/features/posts/server/claim-script.ts`：领取时返回双来源并清理所有来源去重键。
- `src/features/posts/server/post-repository.test.ts`、`claim-script.test.ts`：Redis 原子行为测试。
- `src/app/api/posts/route.ts`、`src/app/api/posts/[id]/claim/route.ts`：API 契约实现。
- `src/app/api/posts/route.test.ts`、`src/app/api/posts/[id]/claim/route.test.ts`：API 契约测试。
- `src/features/posts/components/publish-panel.tsx`：双标签输入、保留状态、合并预览和提交。
- `src/features/posts/components/qr-image-picker.tsx`：本地二维码识别和当前来源清除。
- `src/features/posts/components/publish-panel.test.tsx`、`qr-image-picker.test.tsx`：发布 UI 测试。
- `src/features/posts/components/claim-drawer.tsx`、`post-card.tsx`：双动作领取和大厅来源标识。
- `src/features/posts/components/claim-drawer.test.tsx`、`post-card.test.tsx`：领取 UI 测试。
- `tests/e2e/hall-and-publish.spec.ts`、`tests/fixtures/cmcc-samples.ts`：移动端闭环和样本。
- `README.md`：双来源发布、领取和兼容行为说明。

## Task 1: 领域类型、Schema 和双来源解析

**Files:**
- Modify: `src/features/posts/domain/types.ts`
- Modify: `src/features/posts/domain/schemas.ts`
- Modify: `src/features/posts/domain/parse-source.ts`
- Create: `src/features/posts/domain/parse-sources.test.ts`
- Modify: `src/features/posts/domain/schemas.test.ts`

- [ ] **Step 1: 写失败测试，锁定双来源输入和一致性规则**

```ts
it("双来源解析为同一帖子并保留规范化载荷", () => {
  const result = parseSources(
    { command: GIVE_COMMAND, url: GIVE_URL },
    { discount: 80, pieceNumber: 6 },
  );

  expect(result).toMatchObject({
    type: "GIVE",
    sources: { command: "￥19uSvG￥", url: GIVE_URL },
  });
});

it("双来源指向不同拼图时拒绝", () => {
  expect(() => parseSources(
    { command: GIVE_COMMAND, url: REQUEST_URL },
    { discount: 80, pieceNumber: 6 },
  )).toThrow(/拼图|类型/);
});
```

在 `schemas.test.ts` 增加零来源拒绝、单来源通过、双来源通过断言。

- [ ] **Step 2: 运行测试确认按预期失败**

运行：`pnpm exec vitest run src/features/posts/domain/parse-sources.test.ts src/features/posts/domain/schemas.test.ts`

预期：失败原因是 `parseSources` 未导出且 Schema 仍要求单个 `source`。

- [ ] **Step 3: 实现最小领域模型**

在 `types.ts` 添加：

```ts
export type PostSources = { command?: string; url?: string };
export type ParsedSources = {
  type: PostType;
  sources: PostSources;
  explicitSelection: PuzzleSelection | null;
};
```

把 `HallPostDto.payloadKind` 替换为 `availablePayloadKinds: PayloadKind[]`，把 `StoredPost` 的单载荷字段替换为 `payloads` 与 `payloadHashes`。

在 `schemas.ts` 添加 `sourcesSchema`，用 `superRefine` 拒绝两个字段都为空，并保持既有长度上限。

在 `parse-source.ts` 新增 `parseSources(sources, selection)`：对每个存在的来源调用现有解析器，规范化口令/URL，检查来源间 `type` 和选择一致；保留 `parseSource` 供既有单来源测试复用。

- [ ] **Step 4: 运行领域测试确认通过**

运行同一条 Vitest 命令，预期双来源和既有单来源解析测试全部通过。

- [ ] **Step 5: 提交领域变更**

```bash
git add src/features/posts/domain
git commit -m "feat: model dual puzzle sources"
```

## Task 2: Redis 仓储与领取脚本双载荷化

**Files:**
- Modify: `src/features/posts/server/post-repository.ts`
- Modify: `src/features/posts/server/claim-script.ts`
- Modify: `src/features/posts/server/post-repository.test.ts`
- Modify: `src/features/posts/server/claim-script.test.ts`

- [ ] **Step 1: 写失败仓储测试**

发布测试断言存储 JSON 含两个 `payloads`，脚本收到两个 dedupe key；领取测试断言：

```ts
expect(await claimPost("post-id", "claimant-hash", { redis })).toEqual({
  status: "CLAIMED",
  payloads: { command: "￥19uSvG￥", url: GIVE_URL },
  idempotent: false,
});
```

增加任一来源重复时返回 `DUPLICATE_POST` 且 fake Redis 没有部分写入的测试。

- [ ] **Step 2: 运行仓储测试确认失败**

运行：`pnpm exec vitest run src/features/posts/server/post-repository.test.ts src/features/posts/server/claim-script.test.ts`

预期：当前仓储仍读取单个 `payloadHash`，领取脚本仍返回 `payloadKind/payload`，新增断言失败。

- [ ] **Step 3: 更新发布 Lua 和仓储参数**

将 `PUBLISH_POST_SCRIPT` 改为先遍历所有实际 dedupe key：任意 `EXISTS` 或 `SET NX` 失败时返回 `DUPLICATE`；只有全部成功后才写帖子和四类索引。对不存在的来源不创建占位键。

`publishPost` 为每个来源计算现有 SHA-256 摘要，构造：

```ts
const storedPost = {
  ...post,
  id,
  payloads: normalizedPayloads,
  payloadHashes: normalizedHashes,
};
```

新增 `normalizeStoredPost`，识别旧结构 `{ payloadKind, payload, payloadHash }` 并转换为新结构，仅用于读取和领取兼容窗口。

- [ ] **Step 4: 更新领取 Lua 与结果解析**

领取脚本从帖子 JSON 读取 `payloads` 和 `payloadHashes`，成功时删除所有来源 dedupe key、帖子 key 和索引，并把完整 `payloads` 写入 5 分钟幂等回执。`parseClaimResult` 验证 `payloads` 至少有一个字段且只允许 `command/url`。

- [ ] **Step 5: 更新列表 DTO**

`toHallPostDto` 只返回稳定顺序的 `availablePayloadKinds`，不返回载荷；过期裁剪和孤儿索引清理保持不变。

- [ ] **Step 6: 运行仓储测试确认通过**

运行：`pnpm exec vitest run src/features/posts/server/post-repository.test.ts src/features/posts/server/claim-script.test.ts`

预期：双来源发布、重复回滚、领取清理、幂等和旧结构兼容测试全部通过。

- [ ] **Step 7: 提交仓储变更**

```bash
git add src/features/posts/server
git commit -m "feat: store and claim dual puzzle sources"
```

## Task 3: API 契约与错误映射

**Files:**
- Modify: `src/app/api/posts/route.ts`
- Modify: `src/app/api/posts/[id]/claim/route.ts`
- Modify: `src/app/api/posts/route.test.ts`
- Modify: `src/app/api/posts/[id]/claim/route.test.ts`

- [ ] **Step 1: 添加 API 失败测试**

将创建请求改为 `sources`，增加双来源成功、双来源不一致返回 `SELECTION_MISMATCH`、零来源返回 `INVALID_INPUT` 的测试。领取成功断言：

```ts
expect(await response.json()).toEqual({
  payloads: { command: "￥19uSvG￥", url: GIVE_URL },
  idempotent: false,
});
```

增加大厅响应只包含 `availablePayloadKinds` 且不包含 `payloads` 的断言。

- [ ] **Step 2: 运行 API 测试确认失败**

运行：`pnpm exec vitest run src/app/api/posts/route.test.ts src/app/api/posts/[id]/claim/route.test.ts`

预期：新请求体和新响应断言失败，说明路由仍使用单来源结构。

- [ ] **Step 3: 更新 POST `/api/posts`**

按固定顺序解析 JSON、Zod 校验、HMAC visitorId、限流、调用 `parseSources`、计算来源摘要并调用 `publishPost`。错误映射保持现有稳定错误码；成功 DTO 只返回公开字段。

- [ ] **Step 4: 更新 POST `/api/posts/[id]/claim`**

继续只接受 `{ visitorId }`，调用新的 `claimPost` 并返回 `{ payloads, idempotent }`。所有成功和错误响应继续带 `Cache-Control: no-store`，日志只记录错误码和 requestId。

- [ ] **Step 5: 运行 API 测试确认通过**

重复 Task 3 Step 1 的 Vitest 命令，预期所有 API 单元测试通过。

- [ ] **Step 6: 提交 API 变更**

```bash
git add src/app/api/posts
git commit -m "feat: expose dual-source post APIs"
```

## Task 4: 发布页双标签输入与本地二维码状态

**Files:**
- Modify: `src/features/posts/components/publish-panel.tsx`
- Modify: `src/features/posts/components/qr-image-picker.tsx`
- Modify: `src/features/posts/components/publish-panel.test.tsx`
- Modify: `src/features/posts/components/qr-image-picker.test.tsx`

- [ ] **Step 1: 写组件失败测试**

```ts
it("切换标签时保留口令和二维码来源", async () => {
  renderPanel({ decodeImage: vi.fn(async () => GIVE_URL) });
  fireEvent.change(screen.getByLabelText("拼图口令"), { target: { value: GIVE_COMMAND } });
  fireEvent.click(screen.getByRole("tab", { name: "上传二维码" }));
  selectFile(new File(["png"], "puzzle.png", { type: "image/png" }));
  expect(await screen.findByText("将保存：口令 + 链接")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "粘贴口令" }));
  expect(screen.getByLabelText("拼图口令")).toHaveValue(GIVE_COMMAND);
});
```

增加双来源成功请求体、来源不一致时禁用发布、清除当前来源不影响另一来源的测试。二维码组件测试增加“已识别后可清除且不调用网络”的断言。

- [ ] **Step 2: 运行组件测试确认失败**

运行：`pnpm exec vitest run src/features/posts/components/publish-panel.test.tsx src/features/posts/components/qr-image-picker.test.tsx`

预期：当前页面没有标签、双来源预览和 `sources` 请求体，测试失败。

- [ ] **Step 3: 实现发布面板的双来源状态**

在 `PublishPanel` 中维护：

```ts
const [command, setCommand] = useState("");
const [qrUrl, setQrUrl] = useState("");
const [activeSource, setActiveSource] = useState<"COMMAND" | "URL">("COMMAND");
```

将两个输入放入 shadcn Tabs；切换只改变 `activeSource`，不清空另一值。两个来源分别调用解析器，合并 `parsed`、`sourceErrors` 和完成状态。提交时发送：

```ts
body: JSON.stringify({
  selection,
  sources: { command: command || undefined, url: qrUrl || undefined },
  visitorId: identity.visitorId,
})
```

当任一来源清除时只清除对应 state。提交成功后清空两个来源并导航大厅；失败保留两边内容。

- [ ] **Step 4: 实现二维码选择器清除与状态显示**

保持 `accept="image/*"`、10MB 限制、jsQR 本地解析和白名单校验。增加 `decoded` 受控展示与清除回调，清除时把当前来源置空；解析失败只设置二维码局部错误。

- [ ] **Step 5: 运行组件测试确认通过**

重复 Task 4 Step 1 的 Vitest 命令，预期现有单来源测试和新增双来源交互测试全部通过。

- [ ] **Step 6: 提交发布 UI 变更**

```bash
git add src/features/posts/components
git commit -m "feat: improve dual-source publish input"
```

## Task 5: 大厅标识与领取抽屉双动作

**Files:**
- Modify: `src/features/posts/components/post-card.tsx`
- Modify: `src/features/posts/components/claim-drawer.tsx`
- Modify: `src/features/posts/components/claim-drawer.test.tsx`
- Modify: `src/features/posts/components/post-card.test.tsx`

- [ ] **Step 1: 写领取 UI 失败测试**

增加双来源帖子显示两个动作按钮的测试，并断言成功领取后只请求一次 API、剪贴板失败时显示备用链接按钮：

```ts
expect(screen.getByRole("button", { name: "使用口令领取" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "使用链接领取" })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "使用口令领取" }));
expect(fetchSpy).toHaveBeenCalledTimes(1);
expect(screen.getByRole("button", { name: "改用链接" })).toBeInTheDocument();
```

- [ ] **Step 2: 运行领取组件测试确认失败**

运行：`pnpm exec vitest run src/features/posts/components/claim-drawer.test.tsx src/features/posts/components/post-card.test.tsx`

预期：当前组件只有“确认领取”单按钮，且响应类型仍为单载荷。

- [ ] **Step 3: 更新 PostCard 来源标识**

根据 `availablePayloadKinds` 显示 `口令`、`链接` 或 `口令 + 链接`，不渲染实际载荷。

- [ ] **Step 4: 更新 ClaimDrawer 状态机**

增加 `pendingMethod`、`claimedPayloads` 和 `commandReady` 状态。两个动作按钮共享 `handleClaim(method)`；首次成功响应保存完整 `payloads` 并调用 `onClaimed(post.id)`，随后执行所选方法。后续备用按钮只使用内存中的已领取响应，不再次请求 API。

口令路径严格按 `clipboard.writeText` 成功后再调用 `launchApp("leadeon://")`；链接路径先 `parseUrl` 再调用 `navigate`。错误时保持抽屉打开，提供复制重试或备用来源按钮。身份加载、网络错误、自领和过期提示保持现有中文文案。

- [ ] **Step 5: 运行领取组件测试确认通过**

重复 Task 5 Step 1 的 Vitest 命令，预期双动作、备用路径、剪贴板顺序和卡片移除测试全部通过。

- [ ] **Step 6: 提交领取 UI 变更**

```bash
git add src/features/posts/components
git commit -m "feat: let claimers choose puzzle source"
```

## Task 6: 移动端 E2E、文档和兼容验收

**Files:**
- Modify: `tests/e2e/hall-and-publish.spec.ts`
- Modify: `tests/fixtures/cmcc-samples.ts`
- Modify: `README.md`

- [ ] **Step 1: 添加三个端到端场景**

保留现有 API 拦截方式，分别覆盖仅口令、仅二维码、双来源发布/领取。双来源场景断言请求体含两个 `sources` 字段，领取接口只调用一次，剪贴板和 `leadeon://` 顺序正确，备用按钮不再次请求。

- [ ] **Step 2: 运行 E2E 确认新场景失败**

运行：`pnpm test:e2e`

预期：新双来源场景因页面仍使用单来源结构失败，失败信息指向标签或 `sources` 请求断言。

- [ ] **Step 3: 完成 E2E 兼容实现并验证三个视口**

运行：`pnpm test:e2e`

预期：iPhone SE、iPhone 13、430x932 三套项目全部通过，且无横向溢出。

- [ ] **Step 4: 更新 README**

说明至少一种来源即可发布、双来源一致性校验、领取前选择方式、二维码只在本地解析，以及旧帖子 24 小时兼容窗口。

- [ ] **Step 5: 提交验收文档**

```bash
git add tests README.md
git commit -m "test: cover dual-source mobile flows"
```

## Task 7: 全量验证与交付检查

**Files:**
- No new files; inspect all changed files and git status.

- [ ] **Step 1: 运行完整自动化门禁**

按顺序运行：

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
git diff --check
```

预期：lint、typecheck、unit、build、E2E 全部退出码为 0；integration 在没有专用 Redis 凭证时明确显示 skip；diff check 无输出。

- [ ] **Step 2: 检查隐私和兼容边界**

使用 `rg` 检查大厅 DTO、日志和 README，不出现完整口令、URL 查询串、visitorId 或 Redis token；确认旧结构兼容分支没有延长 TTL。

- [ ] **Step 3: 检查工作区和提交历史**

```bash
git status --short
git log --oneline -8
```

预期：只有计划内提交，工作区无未预期改动。

- [ ] **Step 4: 记录真机门禁**

在 Android 和 iPhone 真机分别验证剪贴板、`leadeon://`、链接跳转、未安装 APP 的手动打开提示，并记录设备、系统、浏览器和结果；不能用桌面浏览器 E2E 替代此门禁。
