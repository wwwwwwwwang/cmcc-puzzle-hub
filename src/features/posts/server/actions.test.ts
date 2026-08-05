import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getCurrentUser, delistPost, revalidatePath } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  delistPost: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser }));
vi.mock("./post-repository", () => ({ delistPost }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { delistMyPost } from "./actions";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("delistMyPost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未登录返回错误,不调用仓储", async () => {
    getCurrentUser.mockResolvedValue(null);
    const state = await delistMyPost({}, form({ postId: "p1" }));
    expect(state.error).toBeTruthy();
    expect(delistPost).not.toHaveBeenCalled();
  });

  it("缺少 postId 返回参数无效", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const state = await delistMyPost({}, form({}));
    expect(state.error).toBeTruthy();
    expect(delistPost).not.toHaveBeenCalled();
  });

  it("下架成功后 revalidate 并返回 success", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    delistPost.mockResolvedValue({ status: "DELISTED" });
    const state = await delistMyPost({}, form({ postId: "p1" }));
    expect(state.success).toBe(true);
    expect(delistPost).toHaveBeenCalledWith("p1", "u1");
    expect(revalidatePath).toHaveBeenCalledWith("/me/posts");
  });

  it("非 DELISTED 结果返回可读错误", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    delistPost.mockResolvedValue({ status: "NOT_FOUND_OR_NOT_OPEN" });
    const state = await delistMyPost({}, form({ postId: "p1" }));
    expect(state.error).toBeTruthy();
  });
});
