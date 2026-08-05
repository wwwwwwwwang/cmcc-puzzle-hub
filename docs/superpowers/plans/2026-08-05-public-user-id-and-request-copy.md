# 公开用户标识与求助文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在大厅稳定展示当前用户和帖子发布者的公开 ID，并让求助帖子使用助力语义。

**Architecture:** 服务端从现有设备 HMAC 派生 16 字符公开 ID，通过独立身份接口提供给全局设备 Provider；帖子 DTO 根据已存储的发布者设备哈希动态补充公开 ID，因此无需 Redis 迁移。前端公开 ID 加载与核心设备身份状态解耦，文案根据 `PostType` 统一切换。

**Tech Stack:** Next.js 16.3、React 19、TypeScript、Vitest、Testing Library、Tailwind CSS

---

### Task 1: 服务端公开 ID 与身份接口

**Files:**
- Create: `src/features/posts/device/public-id.ts`
- Create: `src/features/posts/device/public-id.test.ts`
- Create: `src/app/api/identity/route.ts`
- Create: `src/app/api/identity/route.test.ts`

- [ ] **Step 1: 写公开 ID 失败测试**

测试固定 64 字符设备哈希得到 `U-0123456789ABCDEF`，非法哈希抛出错误。

- [ ] **Step 2: 运行测试确认缺少实现**

Run: `pnpm exec vitest run src/features/posts/device/public-id.test.ts`

Expected: FAIL，模块 `./public-id` 不存在。

- [ ] **Step 3: 实现公开 ID 格式化**

```ts
import "server-only";

const DEVICE_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function toPublicDeviceId(deviceHash: string) {
  if (!DEVICE_HASH_PATTERN.test(deviceHash)) {
    throw new Error("Invalid device hash");
  }
  return `U-${deviceHash.slice(0, 16).toUpperCase()}`;
}
```

- [ ] **Step 4: 写身份接口失败测试**

模拟 `hashVisitorId` 返回固定哈希，断言合法请求返回 `{ publicId: "U-0123456789ABCDEF" }`、非法输入返回 400、哈希异常返回 503，日志不包含原始 `visitorId`。

- [ ] **Step 5: 实现身份接口**

`POST /api/identity` 使用 `claimPostInputSchema` 校验 `visitorId`，调用 `hashVisitorId` 和 `toPublicDeviceId`，成功响应设置 `Cache-Control: no-store`；异常只记录错误码和 `requestId`。

- [ ] **Step 6: 运行目标测试**

Run: `pnpm exec vitest run src/features/posts/device/public-id.test.ts src/app/api/identity/route.test.ts`

Expected: 两个测试文件全部通过。

### Task 2: 帖子 DTO 增加发布者 ID

**Files:**
- Modify: `src/features/posts/domain/types.ts`
- Modify: `src/features/posts/server/post-repository.ts`
- Modify: `src/features/posts/server/post-repository.test.ts`
- Modify: `src/app/api/posts/route.ts`
- Modify: `src/app/api/posts/route.test.ts`

- [ ] **Step 1: 写 DTO 失败断言**

在仓储列表测试和发布 API 测试中断言返回帖子包含 `publisherId: "U-0123456789ABCDEF"`，且不包含 `publisherDeviceHash`。

- [ ] **Step 2: 运行测试确认 publisherId 缺失**

Run: `pnpm exec vitest run src/features/posts/server/post-repository.test.ts src/app/api/posts/route.test.ts`

Expected: FAIL，返回对象缺少 `publisherId`。

- [ ] **Step 3: 实现 DTO 转换**

给 `HallPostDto` 增加 `publisherId: string`；仓储和发布路由的 `toHallPostDto` 均调用 `toPublicDeviceId(post.publisherDeviceHash)`。`StoredPost` 继续只存储 `publisherDeviceHash`，不改 Redis JSON。

- [ ] **Step 4: 更新现有 DTO fixtures 并运行测试**

Run: `pnpm exec vitest run src/features/posts/server/post-repository.test.ts src/app/api/posts/route.test.ts`

Expected: 两个测试文件全部通过。

### Task 3: Provider 加载公开 ID 并展示当前用户

**Files:**
- Modify: `src/features/posts/device/device-provider.tsx`
- Modify: `src/features/posts/device/device-provider.test.tsx`
- Create: `src/features/posts/components/current-user-badge.tsx`
- Create: `src/features/posts/components/current-user-badge.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 写 Provider 失败测试**

给 Provider 注入 `publicIdLoader`，断言设备身份进入 `ready` 后独立加载公开 ID；公开 ID 加载失败时 `status` 仍为 `ready`、`publicIdStatus` 为 `error`。

- [ ] **Step 2: 运行测试确认新状态不存在**

Run: `pnpm exec vitest run src/features/posts/device/device-provider.test.tsx`

Expected: FAIL，`publicId` 和 `publicIdStatus` 不存在。

- [ ] **Step 3: 扩展 Provider**

`DeviceIdentity` 增加：

```ts
publicId: string | null;
publicIdStatus: "idle" | "loading" | "ready" | "error";
```

默认 loader 向 `/api/identity` POST `{ visitorId }`。设备身份成功后启动公开 ID 请求；请求失败只更新 `publicIdStatus`，不修改原有 `status`。

- [ ] **Step 4: 写并实现当前用户徽标**

徽标根据状态显示“正在生成用户标识”“当前用户 · U-…”或“身份标识暂不可用”，成功态使用紧凑蓝色胶囊；在 `app/page.tsx` 标题下方、筛选器上方渲染。

- [ ] **Step 5: 运行身份展示测试**

Run: `pnpm exec vitest run src/features/posts/device/device-provider.test.tsx src/features/posts/components/current-user-badge.test.tsx`

Expected: 两个测试文件全部通过。

### Task 4: 帖子发布者与类型化操作文案

**Files:**
- Modify: `src/features/posts/components/post-card.tsx`
- Modify: `src/features/posts/components/post-card.test.tsx`
- Modify: `src/features/posts/components/claim-drawer.tsx`
- Modify: `src/features/posts/components/claim-drawer.test.tsx`

- [ ] **Step 1: 写 PostCard 失败测试**

断言卡片显示 `发布者 U-...`，当前公开 ID 相同时显示“（我）”；GIVE 按钮为“获取拼图”，REQUEST 按钮为“去助力”。

- [ ] **Step 2: 实现帖子卡片展示**

从 `useDeviceIdentity()` 读取当前 `publicId`，将发布者、来源和相对时间组合为可换行的元信息；按钮文字和主色根据 `post.type` 切换。

- [ ] **Step 3: 写 ClaimDrawer 求助文案失败测试**

REQUEST 场景断言标题“助力 8折 1 号拼图”、说明“请选择助力方式”、按钮“使用口令助力/使用链接助力”和进行中“正在助力…”。GIVE 原有领取文案继续保留。

- [ ] **Step 4: 实现类型化文案**

在组件内根据 `post.type` 生成 `actionNoun`、`actionVerb` 和 `progressLabel`，用于说明、错误、按钮和进行中状态；API 路径和函数名保持不变。

- [ ] **Step 5: 运行组件测试**

Run: `pnpm exec vitest run src/features/posts/components/post-card.test.tsx src/features/posts/components/claim-drawer.test.tsx`

Expected: 两个测试文件全部通过。

### Task 5: 完整验证与发布

**Files:**
- Modify: 以上任务列出的文件
- Create: `docs/superpowers/plans/2026-08-05-public-user-id-and-request-copy.md`

- [ ] **Step 1: 运行完整验证**

Run: `pnpm test:unit`

Expected: 所有单元测试通过。

Run: `pnpm typecheck`

Expected: Next.js 类型生成和 TypeScript 检查通过。

Run: `pnpm lint`

Expected: ESLint 无错误。

Run: `pnpm build`

Expected: Next.js 生产构建成功。

- [ ] **Step 2: 浏览器验证**

在桌面和移动视口确认当前用户胶囊、发布者 ID、本人标记以及 GIVE/REQUEST 按钮不重叠；打开求助抽屉确认全套助力文案。

- [ ] **Step 3: 提交推送**

```powershell
git add -- 'src' 'docs/superpowers/plans/2026-08-05-public-user-id-and-request-copy.md'
git commit -m "feat: 展示公开用户标识并修正求助文案"
git push origin main
```

`docs/code_artifact.html` 保持未跟踪，不纳入提交。
