# 发布页类型优先流程实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将发布页调整为“先选赠送/求助，再选拼图，最后输入内容”，并由前后端共同阻止选择类型与内容类型不一致的发布。

**Architecture:** `PublishPage` 持有可为空的发布类型并控制后续步骤是否启用；`PublishPanel` 继续解析真实口令和二维码，但额外调用统一领域断言校验用户类型；创建帖子请求显式携带 `type`，API 在写入 Redis 前再次执行同一断言。现有 Redis 结构、大厅筛选和领取逻辑保持不变。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Zod、Vitest、Testing Library、Playwright、Tailwind CSS、pnpm

---

### Task 1: 建立显式发布类型的领域与 API 契约

**Files:**
- Modify: `src/features/posts/domain/schemas.ts`
- Modify: `src/features/posts/domain/schemas.test.ts`
- Modify: `src/features/posts/domain/errors.ts`
- Modify: `src/features/posts/domain/parse-source.ts`
- Modify: `src/features/posts/domain/parse-sources.test.ts`
- Modify: `src/app/api/posts/route.ts`
- Modify: `src/app/api/posts/route.test.ts`

- [ ] **Step 1: 为输入类型和类型冲突编写失败测试**

在 `schemas.test.ts` 的 `baseInput` 中增加合法类型，并新增缺少/非法类型测试：

```ts
const baseInput = {
  type: "GIVE" as const,
  sources: { command: "￥19uSvG￥" },
  visitorId: "device-visitor-id",
};

it.each([undefined, "OTHER"])('rejects invalid post type %s', (type) => {
  const result = createPostInputSchema.safeParse({
    ...baseInput,
    type,
    selection: { discount: 80, pieceNumber: 9 },
  });
  expect(result.success).toBe(false);
});
```

在 `parse-sources.test.ts` 新增统一类型断言测试：

```ts
it("rejects a selected request type when content is a gift", () => {
  expect(() => assertPostTypeMatches("GIVE", "REQUEST")).toThrowError(
    "选择的是求助，但内容识别为赠送，请更换内容或发布类型",
  );
});
```

在 `route.test.ts` 的 `baseInput` 增加 `type: "GIVE"`，参数化真实样本发布时把对应 `type` 传入请求，并新增：

```ts
it("请求类型与内容类型不一致返回 400/TYPE_MISMATCH", async () => {
  const response = await POST(
    request({ ...baseInput, type: "REQUEST" }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "TYPE_MISMATCH" },
  });
  expect(publishPost).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行领域与 API 测试确认失败**

Run:

```powershell
pnpm exec vitest run src/features/posts/domain/schemas.test.ts src/features/posts/domain/parse-sources.test.ts src/app/api/posts/route.test.ts
```

Expected: FAIL，原因分别为 schema 尚未要求 `type`、`assertPostTypeMatches` 尚不存在、API 尚未返回 `TYPE_MISMATCH`。

- [ ] **Step 3: 实现类型 schema 和统一领域断言**

在 `schemas.ts` 中把类型加入创建帖子输入：

```ts
export const createPostInputSchema = z.object({
  type: z.enum(["GIVE", "REQUEST"]),
  selection: selectionSchema,
  sources: sourcesSchema,
  visitorId: visitorIdSchema,
});
```

在 `errors.ts` 中扩展错误码：

```ts
export type DomainErrorCode =
  | "INVALID_CONTENT"
  | "SELECTION_MISMATCH"
  | "TYPE_MISMATCH";
```

在 `parse-source.ts` 中导入 `PostType` 并新增统一断言：

```ts
const postTypeLabel = { GIVE: "赠送", REQUEST: "求助" } as const;

export function assertPostTypeMatches(
  actualType: PostType,
  selectedType: PostType,
) {
  if (actualType === selectedType) return;

  throw new DomainError(
    "TYPE_MISMATCH",
    `选择的是${postTypeLabel[selectedType]}，但内容识别为${postTypeLabel[actualType]}，请更换内容或发布类型`,
  );
}
```

- [ ] **Step 4: 在 API 写入前执行类型断言**

在 `route.ts` 中导入 `assertPostTypeMatches`，解析来源后立即校验：

```ts
const parsedSources = parseSources(input.sources, input.selection);
assertPostTypeMatches(parsedSources.type, input.type);
```

保留 Redis 写入中的 `type: parsedSources.type`，不信任客户端字段覆盖解析结果。

- [ ] **Step 5: 运行领域与 API 测试确认通过**

Run:

```powershell
pnpm exec vitest run src/features/posts/domain/schemas.test.ts src/features/posts/domain/parse-sources.test.ts src/app/api/posts/route.test.ts
```

Expected: PASS，所有真实赠送/求助样本携带显式类型，冲突请求返回 `TYPE_MISMATCH`。

- [ ] **Step 6: 提交领域契约**

```powershell
git add -- src/features/posts/domain/schemas.ts src/features/posts/domain/schemas.test.ts src/features/posts/domain/errors.ts src/features/posts/domain/parse-source.ts src/features/posts/domain/parse-sources.test.ts src/app/api/posts/route.ts src/app/api/posts/route.test.ts
git commit -m "feat: 增加发布类型服务端校验"
```

### Task 2: 为发布拼图盘增加完整禁用态

**Files:**
- Modify: `src/features/posts/components/puzzle-board.tsx`
- Modify: `src/features/posts/components/puzzle-board.test.tsx`

- [ ] **Step 1: 编写禁用状态失败测试**

在 `puzzle-board.test.tsx` 新增：

```tsx
it("禁用时鼠标和键盘都不能选择拼图", () => {
  const onChange = vi.fn();
  render(
    <PuzzleBoard
      discount={80}
      value={null}
      onChange={onChange}
      disabled
    />,
  );

  const first = screen.getByRole("radio", { name: "8折1号拼图" });
  expect(first).toBeDisabled();
  expect(first).toHaveAttribute("tabindex", "-1");
  fireEvent.click(first);
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行拼图盘测试确认失败**

Run:

```powershell
pnpm exec vitest run src/features/posts/components/puzzle-board.test.tsx
```

Expected: FAIL，因为 `PuzzleBoardProps` 尚无 `disabled`，拼图按钮仍可操作。

- [ ] **Step 3: 实现禁用属性和视觉状态**

将 `PuzzleBoardProps` 和组件签名调整为：

```ts
type PuzzleBoardProps = {
  discount: Discount;
  value: number | null;
  onChange: (pieceNumber: number | null) => void;
  disabled?: boolean;
};

export function PuzzleBoard({
  discount,
  value,
  onChange,
  disabled = false,
}: PuzzleBoardProps) {
```

在 radiogroup 上增加 `aria-disabled={disabled}`，并为每个按钮增加：

```tsx
disabled={disabled}
tabIndex={
  disabled ? -1 : selected || (value === null && pieceNumber === 1) ? 0 : -1
}
className={`aspect-square rounded-2xl border text-sm font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none ${
  selected
    ? "border-blue-500 bg-blue-600 text-white shadow-blue-200"
    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
}`}
```

原有 `onClick`、方向键和动画逻辑保留；原生 `disabled` 负责阻止鼠标与键盘激活。

- [ ] **Step 4: 运行拼图盘测试确认通过**

Run:

```powershell
pnpm exec vitest run src/features/posts/components/puzzle-board.test.tsx
```

Expected: PASS，原有宫格、焦点和动画测试也保持通过。

- [ ] **Step 5: 提交拼图盘禁用态**

```powershell
git add -- src/features/posts/components/puzzle-board.tsx src/features/posts/components/puzzle-board.test.tsx
git commit -m "feat: 增加发布拼图盘禁用状态"
```

### Task 3: 在发布页增加类型优先步骤

**Files:**
- Modify: `src/app/publish/page.tsx`
- Modify: `src/app/publish/page.test.tsx`

- [ ] **Step 1: 编写默认空选和分步启用失败测试**

扩展 `PublishPanel` mock 以输出 `postType`：

```tsx
PublishPanel: ({
  postType,
  discount,
  pieceNumber,
}: {
  postType: "GIVE" | "REQUEST" | null;
  discount: number;
  pieceNumber: number | null;
}) => (
  <output aria-label="发布面板状态">
    {`${postType ?? "none"}:${discount}:${pieceNumber ?? "none"}`}
  </output>
),
```

将默认测试改为：

```tsx
it("默认不选择类型并禁用拼图步骤", () => {
  render(<PublishPage />);

  expect(screen.getByRole("button", { name: "赠送拼图" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("button", { name: "求助拼图" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("tab", { name: "8折" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "8折1号拼图" })).toBeDisabled();
  expect(screen.getByLabelText("发布面板状态")).toHaveTextContent(
    "none:80:none",
  );
});

it("选择类型后启用拼图并把类型传给发布面板", () => {
  render(<PublishPage />);

  fireEvent.click(screen.getByRole("button", { name: "求助拼图" }));
  expect(screen.getByRole("button", { name: "求助拼图" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("tab", { name: "8折" })).toBeEnabled();
  fireEvent.click(screen.getByRole("radio", { name: "8折1号拼图" }));
  expect(screen.getByLabelText("发布面板状态")).toHaveTextContent(
    "REQUEST:80:1",
  );
});
```

- [ ] **Step 2: 运行发布页测试确认失败**

Run:

```powershell
pnpm exec vitest run src/app/publish/page.test.tsx
```

Expected: FAIL，因为页面还没有类型控制器，折扣和拼图也未禁用。

- [ ] **Step 3: 实现类型状态与分段控制器**

在 `page.tsx` 中导入 `PostType`，新增状态：

```ts
const [postType, setPostType] = useState<PostType | null>(null);
```

在“选择拼图”之前增加：

```tsx
<section className="space-y-3" aria-labelledby="post-type-title">
  <h2 id="post-type-title" className="text-base font-semibold text-slate-900">
    选择发布类型
  </h2>
  <div className="flex rounded-[10px] bg-slate-100 p-1">
    {[
      { value: "GIVE" as const, label: "赠送拼图" },
      { value: "REQUEST" as const, label: "求助拼图" },
    ].map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={postType === option.value}
        onClick={() => setPostType(option.value)}
        className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
          postType === option.value
            ? "bg-white text-blue-600 shadow-sm"
            : "text-slate-500"
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
</section>
```

折扣触发器增加 `disabled={postType === null}`，拼图盘和发布面板改为：

```tsx
<PuzzleBoard
  discount={discount}
  value={pieceNumber}
  onChange={setPieceNumber}
  disabled={postType === null}
/>

<PublishPanel
  postType={postType}
  discount={discount}
  pieceNumber={pieceNumber}
/>
```

- [ ] **Step 4: 运行发布页测试确认通过**

Run:

```powershell
pnpm exec vitest run src/app/publish/page.test.tsx src/features/posts/components/puzzle-board.test.tsx
```

Expected: PASS，类型切换后原有折扣切换清空拼图行为仍正常。

- [ ] **Step 5: 提交类型优先页面结构**

```powershell
git add -- src/app/publish/page.tsx src/app/publish/page.test.tsx
git commit -m "feat: 调整发布页为类型优先流程"
```

### Task 4: 在发布面板阻止类型冲突并提交显式类型

**Files:**
- Modify: `src/features/posts/components/publish-panel.tsx`
- Modify: `src/features/posts/components/publish-panel.test.tsx`

- [ ] **Step 1: 编写禁用顺序、冲突和请求体失败测试**

在 `publish-panel.test.tsx` 导入 `REQUEST_COMMAND`，并让 `renderPanel` 默认传入 `postType="GIVE"`：

```tsx
<PublishPanel
  postType="GIVE"
  discount={80}
  pieceNumber={6}
  {...overrides}
/>
```

新增测试：

```tsx
it("未选择类型时禁用内容输入并提示先选类型", () => {
  renderPanel({ postType: null });
  expect(screen.getByLabelText("拼图口令")).toBeDisabled();
  expect(screen.getByText("请先选择发布类型")).toBeInTheDocument();
});

it("选择类型与内容类型不一致时阻止发布", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  renderPanel({ postType: "REQUEST" });

  fireEvent.change(screen.getByLabelText("拼图口令"), {
    target: { value: GIVE_COMMAND },
  });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "选择的是求助，但内容识别为赠送，请更换内容或发布类型",
  );
  expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("求助内容发布时请求体包含显式类型", async () => {
  const fetchSpy = vi.fn<typeof fetch>();
  fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }));
  vi.stubGlobal("fetch", fetchSpy);
  renderPanel({ postType: "REQUEST", pieceNumber: 1 });

  fireEvent.change(screen.getByLabelText("拼图口令"), {
    target: { value: REQUEST_COMMAND },
  });
  fireEvent.click(screen.getByRole("button", { name: "发布" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  expect(body.type).toBe("REQUEST");
});
```

- [ ] **Step 2: 运行发布面板测试确认失败**

Run:

```powershell
pnpm exec vitest run src/features/posts/components/publish-panel.test.tsx
```

Expected: FAIL，因为 `postType` 属性、类型冲突校验和请求体 `type` 尚未实现。

- [ ] **Step 3: 实现面板类型校验与分步提示**

将属性扩展为：

```ts
type PublishPanelProps = {
  postType: PostType | null;
  discount: Discount;
  pieceNumber: number | null;
  decodeImage?: DecodeImage;
};
```

在预览中解析成功后调用统一断言：

```ts
const parsed = parseSources(sources, selection);
if (postType) assertPostTypeMatches(parsed.type, postType);
return { parsed, error: null };
```

`canSubmit` 和 `handleSubmit` 必须要求 `postType !== null`，创建请求体增加：

```ts
const input: CreatePostInput = {
  type: postType,
  selection,
  sources: {
    command: command.trim() || undefined,
    url: qrUrl.trim() || undefined,
  },
  visitorId: identity.visitorId,
};
```

口令和二维码入口禁用条件统一为 `!postType || !selection || submitting`。在来源标签前显示当前步骤提示：

```tsx
{postType === null ? (
  <p className="text-sm text-slate-500">请先选择发布类型</p>
) : selection === null ? (
  <p className="text-sm text-slate-500">请先选择拼图</p>
) : null}
```

`apiErrorMessage` 增加：

```ts
TYPE_MISMATCH: "选择的发布类型与内容不一致，请检查后重试",
```

- [ ] **Step 4: 运行发布面板及相关测试确认通过**

Run:

```powershell
pnpm exec vitest run src/features/posts/components/publish-panel.test.tsx src/app/publish/page.test.tsx src/features/posts/domain/schemas.test.ts src/app/api/posts/route.test.ts
```

Expected: PASS，赠送和求助请求均包含显式类型，类型冲突不调用 `fetch`。

- [ ] **Step 5: 提交发布面板校验**

```powershell
git add -- src/features/posts/components/publish-panel.tsx src/features/posts/components/publish-panel.test.tsx
git commit -m "feat: 阻止发布类型与内容不一致"
```

### Task 5: 更新移动端发布流程并完成全量验证

**Files:**
- Modify: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 为现有发布流程增加类型选择并编写求助流程**

在 E2E fixture 导入中增加 `REQUEST_COMMAND`。所有现有赠送发布场景在选择拼图前执行：

```ts
await page.getByRole("button", { name: "赠送拼图" }).click();
```

并在请求体断言中增加：

```ts
expect(JSON.parse(calls.publishBodies[0])).toMatchObject({
  type: "GIVE",
  sources: { command: GIVE_COMMAND },
});
```

新增求助和冲突场景：

```ts
test("发布页要求先选类型并阻止类型冲突", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/publish");

  await expect(page.getByRole("radio", { name: "8折1号拼图" })).toBeDisabled();
  await expect(page.getByLabel("拼图口令")).toBeDisabled();
  await page.getByRole("button", { name: "求助拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByLabel("拼图口令").fill(GIVE_COMMAND);
  await expect(page.getByRole("alert")).toContainText(
    "选择的是求助，但内容识别为赠送",
  );
  await expect(page.getByRole("button", { name: "发布" })).toBeDisabled();
  expect(calls.publishBodies).toHaveLength(0);
});

test("求助内容按类型优先流程发布", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/publish");

  await page.getByRole("button", { name: "求助拼图" }).click();
  await page.getByRole("radio", { name: "8折1号拼图" }).click();
  await page.getByLabel("拼图口令").fill(REQUEST_COMMAND);
  await expect(page.getByText("8折1号·求助")).toBeVisible();
  await page.getByRole("button", { name: "发布" }).click();

  await expect.poll(() => calls.publishBodies.length).toBe(1);
  expect(JSON.parse(calls.publishBodies[0])).toMatchObject({
    type: "REQUEST",
    sources: { command: REQUEST_COMMAND },
  });
});
```

- [ ] **Step 2: 运行 iPhone SE E2E 验证新增流程**

Run:

```powershell
pnpm exec playwright test tests/e2e/hall-and-publish.spec.ts --project="iPhone SE"
```

Expected: PASS；类型冲突场景不发送请求，赠送和求助场景均提交显式 `type`。

- [ ] **Step 3: 运行发布相关单元测试**

Run:

```powershell
pnpm exec vitest run src/app/publish/page.test.tsx src/app/api/posts/route.test.ts src/features/posts/components/puzzle-board.test.tsx src/features/posts/components/publish-panel.test.tsx src/features/posts/domain/schemas.test.ts src/features/posts/domain/parse-sources.test.ts
```

Expected: PASS。

- [ ] **Step 4: 运行完整质量门禁**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
git diff --check
```

Expected:

- lint、类型检查和生产构建退出码为 0；
- 单元测试全部通过；
- 未配置专用 Upstash 凭证时，3 个集成测试按设计跳过；
- 所有 Playwright 场景在 iPhone SE、iPhone 13 和 430×932 下通过；
- Git 差异无空白错误。

- [ ] **Step 5: 提交 E2E 与最终回归**

```powershell
git add -- tests/e2e/hall-and-publish.spec.ts
git commit -m "test: 覆盖发布类型优先流程"
```

- [ ] **Step 6: 检查最终仓库状态**

Run:

```powershell
git status --short
git log -5 --oneline
```

Expected: 仅 `docs/code_artifact.html` 保持未跟踪，功能代码、测试、设计和计划均已提交。
