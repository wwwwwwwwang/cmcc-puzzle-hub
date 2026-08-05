# Hall Reference Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留真实帖子、设备身份和原子领取能力的前提下，将大厅主体重构为 `docs/code_artifact.html` 的视觉和交互效果。

**Architecture:** 服务端页面继续读取 Promise 形式的 `searchParams`，大厅筛选组件通过 App Router 的 `useSearchParams` 与 `router.replace` 维护 URL 状态。`GET /api/posts` 和 Redis 仓储增加 `pieceNumber` 过滤；列表、卡片和领取抽屉继续复用现有业务状态机，仅重构展示和操作层级。

**Tech Stack:** Next.js 16.3 App Router、React 19、TypeScript、Tailwind CSS、Vitest、Testing Library、Playwright、Upstash Redis

---

## 文件结构

- Create: `src/features/posts/components/hall-puzzle-board.tsx` — 大厅专用可访问拼图盘。
- Create: `src/features/posts/components/hall-puzzle-board.test.tsx` — 拼图盘布局、选择和键盘测试。
- Create: `src/features/posts/components/relative-time.ts` — 卡片相对时间格式化。
- Create: `src/features/posts/components/relative-time.test.ts` — 相对时间边界测试。
- Modify: `src/app/api/posts/route.ts` — 解析和校验 `pieceNumber`。
- Modify: `src/app/api/posts/route.test.ts` — API 查询参数测试。
- Modify: `src/features/posts/server/post-repository.ts` — 完整索引上的编号过滤。
- Modify: `src/features/posts/server/post-repository.test.ts` — 跨批次编号过滤和分页测试。
- Modify: `src/features/posts/components/post-filters.tsx` — 分段筛选、提示和拼图盘。
- Modify: `src/features/posts/components/post-filters.test.tsx` — URL 状态和交互测试。
- Modify: `src/app/page.tsx` — 默认 8 折、编号解析和参考稿布局。
- Modify: `src/app/page.test.tsx` — 页面组合和默认筛选测试。
- Modify: `src/components/app-shell.tsx` — 420px 最大宽度。
- Modify: `src/components/bottom-nav.tsx` — 底栏与页面宽度一致。
- Modify: `src/components/app-shell.test.tsx` — 宽度与导航回归测试。
- Modify: `src/features/posts/components/post-feed.tsx` — 列表头、刷新、计数和状态。
- Modify: `src/features/posts/components/post-feed.test.tsx` — 请求、刷新、分页和状态测试。
- Modify: `src/features/posts/components/post-card.tsx` — 参考稿卡片和相对时间。
- Modify: `src/features/posts/components/post-card.test.tsx` — 标签、来源、时间和打开抽屉测试。
- Modify: `src/features/posts/components/claim-drawer.tsx` — 参考稿抽屉视觉和操作顺序。
- Modify: `src/features/posts/components/claim-drawer.test.tsx` — 动态标题、关闭和主次操作测试。
- Modify: `tests/e2e/hall-and-publish.spec.ts` — 新大厅交互和移动视口回归。

### Task 0: 保存实施计划

**Files:**
- Create: `docs/superpowers/plans/2026-08-05-hall-reference-redesign.md`

- [ ] **Step 1: 检查计划格式**

Run: `git diff --check -- docs/superpowers/plans/2026-08-05-hall-reference-redesign.md`

Expected: 无输出，退出码为 0。

- [ ] **Step 2: 提交计划**

```powershell
git add -- 'docs/superpowers/plans/2026-08-05-hall-reference-redesign.md'
git commit -m "docs: plan hall reference redesign"
```

### Task 1: 增加真实拼图编号筛选

**Files:**
- Modify: `src/app/api/posts/route.test.ts`
- Modify: `src/app/api/posts/route.ts`
- Modify: `src/features/posts/server/post-repository.test.ts`
- Modify: `src/features/posts/server/post-repository.ts`

- [ ] **Step 1: 编写 API 失败测试**

在 `GET 严格校验参数并只返回安全列表 DTO` 测试中把请求改为：

```ts
const response = await GET(
  new Request(
    "http://localhost/api/posts?type=GIVE&discount=80&pieceNumber=6&limit=20",
  ),
);

expect(listPosts).toHaveBeenCalledWith({
  type: "GIVE",
  discount: 80,
  pieceNumber: 6,
  limit: 20,
});
```

把下列查询加入非法参数表：

```ts
"pieceNumber=0",
"pieceNumber=1.5",
"pieceNumber=05",
"discount=95&pieceNumber=5",
"pieceNumber=1&pieceNumber=2",
```

- [ ] **Step 2: 编写仓储失败测试**

在 `describe("listPosts")` 中添加：

```ts
it("跨批次扫描直到收集到编号匹配的帖子", async () => {
  const posts = Array.from({ length: 41 }, (_, index) => ({
    ...basePost,
    id: `p_1800086400000_123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
    pieceNumber: index === 40 ? 2 : 1,
  } satisfies StoredPost));

  const redis = createRedis({
    zrange: vi.fn(async (_key, _max, _min, options) =>
      posts
        .slice(options.offset, options.offset + options.count)
        .flatMap((post, index) => [post.id, 100 - options.offset - index]),
    ),
    mget: vi.fn(async (...keys: string[]) =>
      keys.map((key) => posts.find((post) => key.endsWith(post.id)) ?? null),
    ),
  });

  const page = await listPosts({ pieceNumber: 2, limit: 20 }, { redis });

  expect(page.items.map(({ id }) => id)).toEqual([posts[40].id]);
  expect(redis.zrange).toHaveBeenCalledTimes(2);
  expect(page.nextCursor).toBeNull();
});
```

- [ ] **Step 3: 运行失败测试**

Run: `pnpm exec vitest run src/app/api/posts/route.test.ts src/features/posts/server/post-repository.test.ts`

Expected: API 不接受 `pieceNumber`，仓储未过滤编号，相关断言失败。

- [ ] **Step 4: 实现 API 校验**

在 `parseListQuery` 中使用以下逻辑：

```ts
const allowedKeys = new Set([
  "type",
  "discount",
  "pieceNumber",
  "cursor",
  "limit",
]);

const pieceNumberValue = searchParams.get("pieceNumber");
const pieceNumber = pieceNumberValue ? Number(pieceNumberValue) : undefined;

if (
  pieceNumberValue !== null &&
  !/^[1-9]\d*$/.test(pieceNumberValue)
) {
  return { success: false as const, field: "pieceNumber" };
}

const maxPieceNumber =
  discount === 95 ? 4 : discount === 90 ? 6 : discount === 80 ? 9 : 9;
if (pieceNumber !== undefined && pieceNumber > maxPieceNumber) {
  return { success: false as const, field: "pieceNumber" };
}
```

返回过滤条件时加入：

```ts
...(pieceNumber ? { pieceNumber } : {}),
```

- [ ] **Step 5: 实现仓储过滤**

把 `ListPostFilters` 改为：

```ts
export type ListPostFilters = {
  type?: PostType;
  discount?: Discount;
  pieceNumber?: number;
  cursor?: string;
  limit?: number;
};
```

在 `entries.forEach` 中完成详情规范化后、写入 `posts` 和 `collected` 前加入：

```ts
if (
  filters.pieceNumber !== undefined &&
  storedPost.pieceNumber !== filters.pieceNumber
) {
  return;
}
```

- [ ] **Step 6: 运行测试并提交**

Run: `pnpm exec vitest run src/app/api/posts/route.test.ts src/features/posts/server/post-repository.test.ts`

Expected: 两个测试文件全部通过。

```powershell
git add -- src/app/api/posts/route.ts src/app/api/posts/route.test.ts src/features/posts/server/post-repository.ts src/features/posts/server/post-repository.test.ts
git commit -m "feat: filter hall posts by puzzle piece"
```

### Task 2: 实现大厅拼图盘和分段筛选

**Files:**
- Create: `src/features/posts/components/hall-puzzle-board.test.tsx`
- Create: `src/features/posts/components/hall-puzzle-board.tsx`
- Modify: `src/features/posts/components/post-filters.test.tsx`
- Modify: `src/features/posts/components/post-filters.tsx`

- [ ] **Step 1: 编写拼图盘失败测试**

创建 `hall-puzzle-board.test.tsx`：

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HallPuzzleBoard } from "./hall-puzzle-board";

describe("HallPuzzleBoard", () => {
  afterEach(cleanup);

  it.each([
    [95, 4, "repeat(2, minmax(0, 1fr))"],
    [90, 6, "repeat(2, minmax(0, 1fr))"],
    [80, 9, "repeat(3, minmax(0, 1fr))"],
  ] as const)("%s 折渲染 %s 块", (discount, count, columns) => {
    const onChange = vi.fn();
    render(
      <HallPuzzleBoard discount={discount} value={null} onChange={onChange} />,
    );

    const board = screen.getByRole("radiogroup");
    expect(screen.getAllByRole("radio")).toHaveLength(count);
    expect(board).toHaveStyle({ gridTemplateColumns: columns });
  });

  it("点击同一编号时取消选择", () => {
    const onChange = vi.fn();
    const view = render(
      <HallPuzzleBoard discount={80} value={null} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(onChange).toHaveBeenLastCalledWith(6);

    view.rerender(
      <HallPuzzleBoard discount={80} value={6} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("方向键循环移动选择和焦点", () => {
    const onChange = vi.fn();
    render(
      <HallPuzzleBoard discount={80} value={null} onChange={onChange} />,
    );
    const first = screen.getByRole("radio", { name: "8折1号拼图" });
    const ninth = screen.getByRole("radio", { name: "8折9号拼图" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(ninth).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith(9);
  });
});
```

- [ ] **Step 2: 编写筛选失败测试**

把 `post-filters.test.tsx` 改为使用按钮，并添加以下断言：

```tsx
render(<PostFilters discount={80} type={undefined} pieceNumber={null} />);

expect(screen.getByRole("button", { name: "8折(9块)" })).toHaveAttribute(
  "aria-pressed",
  "true",
);
expect(screen.getByRole("button", { name: "全部分类" })).toHaveAttribute(
  "aria-pressed",
  "true",
);

fireEvent.click(screen.getByRole("button", { name: "只看求助" }));
expect(replace).toHaveBeenLastCalledWith("/?type=REQUEST", { scroll: false });

currentSearch = "discount=80&pieceNumber=6&cursor=opaque";
cleanup();
render(<PostFilters discount={80} type={undefined} pieceNumber={6} />);
fireEvent.click(screen.getByRole("button", { name: "95折(4块)" }));
expect(replace).toHaveBeenLastCalledWith("/?discount=95", { scroll: false });

currentSearch = "";
cleanup();
render(<PostFilters discount={80} type={undefined} pieceNumber={null} />);
fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
expect(replace).toHaveBeenLastCalledWith("/?pieceNumber=6", { scroll: false });
```

- [ ] **Step 3: 运行失败测试**

Run: `pnpm exec vitest run src/features/posts/components/hall-puzzle-board.test.tsx src/features/posts/components/post-filters.test.tsx`

Expected: 新组件不存在，旧筛选仍为 `select`，测试失败。

- [ ] **Step 4: 实现大厅拼图盘**

创建 `hall-puzzle-board.tsx`：

```tsx
"use client";

import { useRef } from "react";

import type { Discount } from "../domain/types";

const counts = { 95: 4, 90: 6, 80: 9 } as const;
const labels = { 95: "95折", 90: "9折", 80: "8折" } as const;

type HallPuzzleBoardProps = {
  discount: Discount;
  value: number | null;
  onChange: (value: number | null) => void;
};

export function HallPuzzleBoard({
  discount,
  value,
  onChange,
}: HallPuzzleBoardProps) {
  const count = counts[discount];
  const columns = discount === 80 ? 3 : 2;
  const rows = count / columns;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectAndFocus(pieceNumber: number) {
    onChange(pieceNumber);
    refs.current[pieceNumber - 1]?.focus();
  }

  function handleKeyDown(key: string, pieceNumber: number) {
    if (key === "ArrowRight" || key === "ArrowDown") {
      selectAndFocus(pieceNumber === count ? 1 : pieceNumber + 1);
      return true;
    }
    if (key === "ArrowLeft" || key === "ArrowUp") {
      selectAndFocus(pieceNumber === 1 ? count : pieceNumber - 1);
      return true;
    }
    if (key === "Home") {
      selectAndFocus(1);
      return true;
    }
    if (key === "End") {
      selectAndFocus(count);
      return true;
    }
    return false;
  }

  return (
    <div
      role="radiogroup"
      aria-label={`${labels[discount]}拼图选择`}
      className="grid size-[270px] max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: count }, (_, index) => {
        const pieceNumber = index + 1;
        const selected = value === pieceNumber;
        return (
          <button
            key={pieceNumber}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${labels[discount]}${pieceNumber}号拼图`}
            tabIndex={selected || (value === null && pieceNumber === 1) ? 0 : -1}
            onClick={() => onChange(selected ? null : pieceNumber)}
            onKeyDown={(event) => {
              if (handleKeyDown(event.key, pieceNumber)) event.preventDefault();
            }}
            className={`border-b border-r border-slate-200 text-[28px] font-bold outline-none transition-[background-color,color,transform] active:scale-[0.98] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
              selected
                ? "bg-blue-50 text-blue-600 shadow-[inset_0_0_0_2px_#2563eb]"
                : "bg-white text-slate-400 hover:bg-slate-50"
            }`}
          >
            {pieceNumber}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: 实现分段筛选**

将 `post-filters.tsx` 替换为：

```tsx
"use client";

import { MousePointer2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Discount, PostType } from "../domain/types";
import { HallPuzzleBoard } from "./hall-puzzle-board";

type PostFiltersProps = {
  discount: Discount;
  type?: PostType;
  pieceNumber: number | null;
};

const discounts = [
  { value: 95 as const, label: "95折(4块)" },
  { value: 90 as const, label: "9折(6块)" },
  { value: 80 as const, label: "8折(9块)" },
];

const types = [
  { value: undefined, label: "全部分类" },
  { value: "GIVE" as const, label: "只看赠送" },
  { value: "REQUEST" as const, label: "只看求助" },
];

const gridNames = { 95: "四宫格", 90: "六宫格", 80: "九宫格" } as const;

export function PostFilters({ discount, type, pieceNumber }: PostFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    params.delete("cursor");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2.5" aria-label="大厅筛选">
        <div className="flex rounded-[10px] bg-slate-100 p-1">
          {discounts.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={discount === option.value}
              onClick={() =>
                navigate((params) => {
                  params.set("discount", String(option.value));
                  params.delete("pieceNumber");
                })
              }
              className={`flex-1 rounded-lg px-1 py-2 text-sm font-medium transition ${
                discount === option.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-[10px] bg-slate-100 p-1">
          {types.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={type === option.value}
              onClick={() =>
                navigate((params) => {
                  if (option.value) params.set("type", option.value);
                  else params.delete("type");
                })
              }
              className={`flex-1 rounded-lg px-1 py-2 text-sm font-medium transition ${
                type === option.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center pb-4">
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-slate-500">
          <MousePointer2 className="size-3.5" aria-hidden="true" />
          点击下方{gridNames[discount]}，精准筛选所需拼图
        </p>
        <HallPuzzleBoard
          discount={discount}
          value={pieceNumber}
          onChange={(value) =>
            navigate((params) => {
              if (value === null) params.delete("pieceNumber");
              else params.set("pieceNumber", String(value));
            })
          }
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 运行测试并提交**

Run: `pnpm exec vitest run src/features/posts/components/hall-puzzle-board.test.tsx src/features/posts/components/post-filters.test.tsx`

Expected: 两个测试文件全部通过。

```powershell
git add -- src/features/posts/components/hall-puzzle-board.tsx src/features/posts/components/hall-puzzle-board.test.tsx src/features/posts/components/post-filters.tsx src/features/posts/components/post-filters.test.tsx
git commit -m "feat: add interactive hall puzzle filters"
```

### Task 3: 组合参考稿大厅页面与 420px 外壳

**Files:**
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/bottom-nav.tsx`

- [ ] **Step 1: 编写页面失败测试**

让页面测试中的 mock 记录属性：

```tsx
vi.mock("@/features/posts/components/post-feed", () => ({
  PostFeed: (props: Record<string, unknown>) => (
    <output aria-label="列表属性">{JSON.stringify(props)}</output>
  ),
}));

vi.mock("@/features/posts/components/post-filters", () => ({
  PostFilters: (props: Record<string, unknown>) => (
    <output aria-label="筛选属性">{JSON.stringify(props)}</output>
  ),
}));
```

添加测试：

```tsx
it("默认使用 8 折并传递拼图编号筛选", async () => {
  const page = await Home({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ type: "REQUEST", pieceNumber: "6" }),
  });
  render(page);

  expect(screen.getByLabelText("筛选属性")).toHaveTextContent(
    JSON.stringify({ discount: 80, type: "REQUEST", pieceNumber: 6 }),
  );
  expect(screen.getByLabelText("列表属性")).toHaveTextContent(
    JSON.stringify({ discount: 80, type: "REQUEST", pieceNumber: 6 }),
  );
});

it("忽略不属于当前折扣的拼图编号", async () => {
  const page = await Home({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ discount: "95", pieceNumber: "6" }),
  });
  render(page);

  expect(screen.getByLabelText("筛选属性")).toHaveTextContent(
    JSON.stringify({ discount: 95, pieceNumber: null }),
  );
});
```

把外壳宽度断言改为：

```ts
expect(shell).toHaveClass("min-h-dvh", "max-w-[420px]");
expect(screen.getByRole("navigation", { name: "主要导航" })).toHaveClass(
  "max-w-[420px]",
);
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec vitest run src/app/page.test.tsx src/components/app-shell.test.tsx`

Expected: 页面未传递筛选属性，外壳仍为 `max-w-md`，测试失败。

- [ ] **Step 3: 实现页面解析和布局**

将 `page.tsx` 的页面函数改为：

```tsx
export default async function Home({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const type = parseType(query.type);
  const discount = parseDiscount(query.discount) ?? 80;
  const pieceNumber = parsePieceNumber(query.pieceNumber, discount);

  return (
    <section className="min-h-dvh bg-white">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50 px-5 pb-2 pt-5">
        <h1 className="mb-4 text-[22px] font-bold tracking-tight text-slate-900">
          周三充值日拼图互助
        </h1>
        <PostFilters
          discount={discount}
          type={type}
          pieceNumber={pieceNumber}
        />
      </header>
      <div className="px-5 py-4">
        <PostFeed
          discount={discount}
          type={type}
          pieceNumber={pieceNumber ?? undefined}
        />
      </div>
    </section>
  );
}
```

添加解析函数：

```ts
function parsePieceNumber(
  value: string | string[] | undefined,
  discount: Discount,
) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const pieceNumber = Number(value);
  const max = discount === 95 ? 4 : discount === 90 ? 6 : 9;
  return pieceNumber <= max ? pieceNumber : null;
}
```

- [ ] **Step 4: 实现 420px 外壳**

在 `app-shell.tsx` 把 `max-w-md` 改为 `max-w-[420px]`。在 `bottom-nav.tsx` 同样把 `max-w-md` 改为 `max-w-[420px]`。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm exec vitest run src/app/page.test.tsx src/components/app-shell.test.tsx`

Expected: 页面和外壳测试通过。

```powershell
git add -- src/app/page.tsx src/app/page.test.tsx src/components/app-shell.tsx src/components/bottom-nav.tsx src/components/app-shell.test.tsx
git commit -m "feat: compose reference hall layout"
```

### Task 4: 重构列表头、刷新和状态

**Files:**
- Modify: `src/features/posts/components/post-feed.test.tsx`
- Modify: `src/features/posts/components/post-feed.tsx`

- [ ] **Step 1: 编写列表失败测试**

在 `post-feed.test.tsx` 中隔离卡片展示，避免列表测试依赖 Task 5 才会修改的卡片文案：

```tsx
vi.mock("./post-card", () => ({
  PostCard: ({ post }: { post: { id: string } }) => (
    <article>{post.id}</article>
  ),
}));
```

在首个测试中使用：

```tsx
render(<PostFeed type="GIVE" discount={80} pieceNumber={6} />);

expect(await screen.findByText(post.id)).toBeInTheDocument();
expect(fetchSpy).toHaveBeenCalledWith(
  "/api/posts?limit=20&type=GIVE&discount=80&pieceNumber=6",
  expect.objectContaining({ signal: expect.any(AbortSignal) }),
);
expect(screen.getByText("最新发布")).toBeInTheDocument();
expect(screen.getByText("共 1 条")).toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
expect(fetchSpy.mock.calls[1][0]).toContain("cursor=opaque-cursor");
expect(screen.getAllByRole("article")).toHaveLength(2);
expect(screen.getByText(`${post.id}-2`)).toBeInTheDocument();
```

添加刷新测试：

```tsx
it("刷新按钮重新请求第一页并清空旧游标", async () => {
  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [post], nextCursor: "opaque" })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null })),
    );
  vi.stubGlobal("fetch", fetchSpy);
  render(<PostFeed discount={80} />);

  await screen.findByText("共 1 条");
  fireEvent.click(screen.getByRole("button", { name: "刷新" }));

  expect(await screen.findByText("当前条件下暂无数据，试试其他拼图吧")).toBeInTheDocument();
  expect(fetchSpy.mock.calls[1][0]).not.toContain("cursor=");
});
```

把空状态断言改为“当前条件下暂无数据，试试其他拼图吧”，加载状态断言改为“正在寻找最新的拼图...”。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec vitest run src/features/posts/components/post-feed.test.tsx`

Expected: `pieceNumber`、列表头、刷新和新状态文案尚未实现，测试失败。

- [ ] **Step 3: 实现列表组件**

将 `PostFeedProps` 改为：

```ts
type PostFeedProps = {
  type?: PostType;
  discount?: Discount;
  pieceNumber?: number;
};
```

在请求参数中加入：

```ts
if (pieceNumber !== undefined) {
  params.set("pieceNumber", String(pieceNumber));
}
```

把 `load` 的依赖改为：

```ts
}, [discount, pieceNumber, type]);
```

删除三个提前 `return`，把组件返回值改为：

```tsx
return (
  <section aria-label="最新发布">
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-slate-700">最新发布</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading || loadingMore}
          onClick={() => void load()}
          className="h-7 rounded-full bg-blue-50 px-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 hover:text-blue-700"
        >
          <RefreshCw
            className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          刷新
        </Button>
      </div>
      <span className="text-[13px] text-slate-400">共 {items.length} 条</span>
    </div>

    {loading ? (
      <div
        className="flex flex-col items-center gap-3 py-12 text-sm text-slate-500"
        aria-label="加载中"
      >
        <LoaderCircle className="size-7 animate-spin text-blue-600" />
        <span>正在寻找最新的拼图...</span>
      </div>
    ) : error ? (
      <div className="space-y-3 py-10 text-center">
        <p className="text-sm text-slate-600">加载失败，请重试</p>
        <Button type="button" onClick={() => void load()}>
          重试
        </Button>
      </div>
    ) : items.length === 0 ? (
      <div className="py-14 text-center text-slate-400">
        <Puzzle className="mx-auto mb-3 size-10 opacity-50" />
        <p className="text-sm">当前条件下暂无数据，试试其他拼图吧</p>
      </div>
    ) : (
      <div className="space-y-3">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onRemoved={(id) =>
              setItems((current) => current.filter((item) => item.id !== id))
            }
          />
        ))}
        {cursor ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loadingMore}
            onClick={() => void load(true)}
          >
            {loadingMore ? "加载中…" : "加载更多"}
          </Button>
        ) : null}
      </div>
    )}
  </section>
);
```

从 `lucide-react` 导入 `LoaderCircle`、`Puzzle` 和 `RefreshCw`，移除未使用的 `Skeleton`。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm exec vitest run src/features/posts/components/post-feed.test.tsx`

Expected: 列表测试全部通过。

```powershell
git add -- src/features/posts/components/post-feed.tsx src/features/posts/components/post-feed.test.tsx
git commit -m "feat: redesign hall feed states"
```

### Task 5: 重构帖子卡片和相对时间

**Files:**
- Create: `src/features/posts/components/relative-time.test.ts`
- Create: `src/features/posts/components/relative-time.ts`
- Modify: `src/features/posts/components/post-card.test.tsx`
- Modify: `src/features/posts/components/post-card.tsx`

- [ ] **Step 1: 编写相对时间失败测试**

创建 `relative-time.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relative-time";

const now = Date.parse("2026-08-05T04:00:00.000Z");

describe("formatRelativeTime", () => {
  it.each([
    ["2026-08-05T03:59:40.000Z", "刚刚"],
    ["2026-08-05T03:58:00.000Z", "2分钟前"],
    ["2026-08-05T01:00:00.000Z", "3小时前"],
  ])("格式化 %s", (createdAt, expected) => {
    expect(formatRelativeTime(createdAt, now)).toBe(expected);
  });

  it("超过一天显示本地月日", () => {
    expect(formatRelativeTime("2026-08-03T04:00:00.000Z", now)).toMatch(
      /8.*3/,
    );
  });
});
```

- [ ] **Step 2: 编写卡片失败测试**

在 `post-card.test.tsx` 的 `afterEach` 中加入 `vi.useRealTimers()`，并添加：

```tsx
it("显示参考稿标签、来源、相对时间和获取按钮", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
  render(<PostCard post={post} />);

  expect(screen.getByText("出/赠")).toBeInTheDocument();
  expect(screen.getByText("8折 · 第 6 号")).toBeInTheDocument();
  expect(screen.getByText("仅有口令 · 2分钟前")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "一键获取" })).toBeInTheDocument();
});
```

把打开抽屉测试的按钮名称改为“一键获取”。

- [ ] **Step 3: 运行失败测试**

Run: `pnpm exec vitest run src/features/posts/components/relative-time.test.ts src/features/posts/components/post-card.test.tsx`

Expected: 时间工具不存在，旧卡片文案和按钮不匹配，测试失败。

- [ ] **Step 4: 实现相对时间工具**

创建 `relative-time.ts`：

```ts
export function formatRelativeTime(createdAt: string, now = Date.now()) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return "时间未知";

  const elapsed = Math.max(0, now - created);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(created));
}
```

- [ ] **Step 5: 实现参考稿卡片**

在 `post-card.tsx` 中把来源文案改为：

```ts
const sourceLabel =
  post.availablePayloadKinds.length === 2
    ? "口令 + 链接"
    : post.availablePayloadKinds[0] === "COMMAND"
      ? "仅有口令"
      : "仅有链接";
```

把卡片 JSX 改为：

```tsx
<article className="rounded-lg border border-slate-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition hover:border-slate-200 hover:shadow-sm">
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 text-base font-bold text-slate-800">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
            post.type === "GIVE"
              ? "bg-blue-50 text-blue-600"
              : "bg-orange-50 text-orange-600"
          }`}
        >
          {post.type === "GIVE" ? "出/赠" : "求助"}
        </span>
        <span>
          {post.discount === 95 ? "95折" : post.discount === 90 ? "9折" : "8折"}
          {` · 第 ${post.pieceNumber} 号`}
        </span>
      </div>
      <p className="truncate text-xs text-slate-500">
        {sourceLabel} · {formatRelativeTime(post.createdAt)}
      </p>
    </div>
    <Button
      type="button"
      onClick={() => setOpen(true)}
      className="shrink-0 rounded-full px-[18px] shadow-[0_2px_4px_rgba(37,99,235,0.2)]"
    >
      一键获取
    </Button>
  </div>
  {open ? (
    <ClaimDrawer
      post={post}
      open={open}
      onOpenChange={handleOpenChange}
      onClaimed={() => {
        claimedRef.current = true;
      }}
    />
  ) : null}
</article>
```

导入 `formatRelativeTime`。

- [ ] **Step 6: 运行测试并提交**

Run: `pnpm exec vitest run src/features/posts/components/relative-time.test.ts src/features/posts/components/post-card.test.tsx`

Expected: 时间和卡片测试全部通过。

```powershell
git add -- src/features/posts/components/relative-time.ts src/features/posts/components/relative-time.test.ts src/features/posts/components/post-card.tsx src/features/posts/components/post-card.test.tsx
git commit -m "feat: redesign hall post cards"
```

### Task 6: 重构领取抽屉视觉和操作顺序

**Files:**
- Modify: `src/features/posts/components/claim-drawer.test.tsx`
- Modify: `src/features/posts/components/claim-drawer.tsx`

- [ ] **Step 1: 编写抽屉失败测试**

添加动态标题测试：

```tsx
it("根据帖子类型显示领取或助力标题", () => {
  renderDrawer(commandPost);
  expect(screen.getByText("领取 8折 6 号拼图")).toBeInTheDocument();

  cleanup();
  renderDrawer({ ...commandPost, type: "REQUEST" });
  expect(screen.getByText("助力 8折 6 号拼图")).toBeInTheDocument();
});
```

把双来源测试扩展为：

```tsx
const buttons = screen.getAllByRole("button");
const linkIndex = buttons.findIndex((button) => button.textContent?.includes("使用链接领取"));
const commandIndex = buttons.findIndex((button) => button.textContent?.includes("使用口令领取"));
expect(linkIndex).toBeGreaterThanOrEqual(0);
expect(commandIndex).toBeGreaterThan(linkIndex);
```

把“打开抽屉和取消”测试改为点击：

```ts
fireEvent.click(screen.getByRole("button", { name: "关闭领取弹窗" }));
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec vitest run src/features/posts/components/claim-drawer.test.tsx`

Expected: 动态标题、关闭按钮和链接优先顺序尚未实现，测试失败。

- [ ] **Step 3: 调整抽屉结构**

从 `lucide-react` 增加导入 `X`。把 `DrawerContent` 和头部改为：

```tsx
<DrawerContent className="mx-auto max-w-[420px] rounded-t-[20px] border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
  <button
    type="button"
    aria-label="关闭领取弹窗"
    onClick={() => onOpenChange(false)}
    className="absolute right-4 top-4 z-10 flex size-[30px] items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200"
  >
    <X className="size-4" aria-hidden="true" />
  </button>
  <DrawerHeader className="text-center">
    <DrawerTitle>
      {post.type === "GIVE" ? "领取" : "助力"}{" "}
      {post.discount === 95 ? "95折" : post.discount === 90 ? "9折" : "8折"}{" "}
      {post.pieceNumber} 号拼图
    </DrawerTitle>
    <DrawerDescription>请选择获取方式</DrawerDescription>
  </DrawerHeader>
```

初次领取按钮按以下顺序渲染：

```tsx
{hasUrl ? (
  <Button
    type="button"
    className="h-12 rounded-xl"
    disabled={!identityReady || submitting}
    onClick={() => void handleClaim("URL")}
  >
    <ExternalLink data-icon="inline-start" />
    {submitting && pendingMethod === "URL" ? "正在领取…" : "使用链接领取"}
  </Button>
) : null}
{hasCommand ? (
  <Button
    type="button"
    className="h-12 rounded-xl"
    variant={hasUrl ? "secondary" : "default"}
    disabled={!identityReady || submitting}
    onClick={() => void handleClaim("COMMAND")}
  >
    <Copy data-icon="inline-start" />
    {submitting && pendingMethod === "COMMAND" ? "正在领取…" : "使用口令领取"}
  </Button>
) : null}
```

删除底部“取消 / 关闭”按钮；关闭能力由右上角按钮和遮罩提供。已领取后的“复制口令”“改用链接”“再次唤起”和错误恢复按钮保持现有逻辑。

- [ ] **Step 4: 运行抽屉和卡片测试并提交**

Run: `pnpm exec vitest run src/features/posts/components/claim-drawer.test.tsx src/features/posts/components/post-card.test.tsx`

Expected: 抽屉和卡片测试全部通过，领取请求时机不变。

```powershell
git add -- src/features/posts/components/claim-drawer.tsx src/features/posts/components/claim-drawer.test.tsx
git commit -m "feat: redesign hall claim drawer"
```

### Task 7: 更新移动端 E2E 并验证参考交互

**Files:**
- Modify: `tests/e2e/hall-and-publish.spec.ts`

- [ ] **Step 1: 更新原有领取选择器**

把大厅卡片按钮 `name: "领取"` 全部改为 `name: "一键获取"`，把取消按钮操作改为：

```ts
await page.getByRole("button", { name: "关闭领取弹窗" }).click();
```

- [ ] **Step 2: 添加大厅筛选 E2E**

扩展 `installApiMocks`，在 GET 分支记录请求 URL：

```ts
const calls = {
  claim: 0,
  publishBodies: [] as string[],
  listUrls: [] as string[],
};

if (request.method() === "GET") {
  calls.listUrls.push(request.url());
  await route.fulfill({ json: { items: [post], nextCursor: null } });
  return;
}
```

添加测试：

```ts
test("大厅按参考稿筛选折扣、类型和拼图编号", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "8折(9块)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("radio", { name: "8折6号拼图" })).toBeVisible();

  await page.getByRole("button", { name: "只看赠送" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();

  await expect(page).toHaveURL(/type=GIVE/);
  await expect(page).toHaveURL(/pieceNumber=6/);
  await expect
    .poll(() => calls.listUrls.at(-1) ?? "")
    .toContain("pieceNumber=6");

  await page.getByRole("button", { name: "95折(4块)" }).click();
  await expect(page).not.toHaveURL(/pieceNumber=/);
  await expect(page.getAllByRole("radio")).toHaveCount(4);
});
```

- [ ] **Step 3: 扩展无溢出测试**

大厅加载后额外断言：

```ts
await expect(page.getByText("最新发布")).toBeVisible();
await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
await expect(page.getByRole("button", { name: "一键获取" })).toBeVisible();
```

- [ ] **Step 4: 运行 E2E 并提交**

Run: `pnpm test:e2e`

Expected: Chromium/WebKit 配置下全部用例通过，320px、375px、430px 视口无横向溢出。

```powershell
git add -- tests/e2e/hall-and-publish.spec.ts
git commit -m "test: cover reference hall interactions"
```

### Task 8: 完整验证和视觉验收

**Files:**
- Verify: all files changed in Tasks 1-7
- Keep untracked: `docs/code_artifact.html`

- [ ] **Step 1: 检查参考文件未被暂存**

Run: `git status --short`

Expected: `docs/code_artifact.html` 显示为 `??`，没有其他未提交实现文件。

Run: `git ls-files --error-unmatch docs/code_artifact.html`

Expected: 退出码为 1，表示参考文件未被 Git 跟踪。

- [ ] **Step 2: 运行静态和单元验证**

Run: `git diff --check`

Expected: 无空白错误。

Run: `pnpm lint`

Expected: 退出码为 0。

Run: `pnpm typecheck`

Expected: Next.js 类型生成和 TypeScript 检查通过。

Run: `pnpm test:unit`

Expected: 所有单元测试通过。

Run: `pnpm test:integration`

Expected: 配置专用 Upstash 凭证时通过；没有凭证时明确跳过，不连接生产 Redis。

Run: `pnpm build`

Expected: Next.js 16.3 生产构建成功。

Run: `pnpm test:e2e`

Expected: 所有移动端 E2E 通过。

- [ ] **Step 3: 进行截图视觉比对**

使用 Playwright 或应用内浏览器分别打开：

```text
http://localhost:3000/
file:///F:/cursor/cmcc-puzzle-hub/docs/code_artifact.html
```

在 320×568、375×812、430×932 和桌面视口检查：

- 网站名称保持“周三充值日拼图互助”。
- 两组分段控件、提示和拼图盘与参考稿同序。
- 95 折为 2×2、9 折为 2×3、8 折为 3×3。
- 列表头、刷新、计数、卡片密度和抽屉层级与参考一致。
- 底部导航存在且不遮挡列表操作。
- 页面无横向溢出、控件重叠、文字截断或空白状态。

- [ ] **Step 4: 最终状态检查**

Run: `git status --short --branch`

Expected: `main` 只保留未跟踪的 `docs/code_artifact.html`，实现提交全部存在于本地分支。
