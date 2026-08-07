import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getCurrentUser, getApprovedUser, delistPost, resolveRequestHelp, revalidatePath } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getApprovedUser: vi.fn(() => getCurrentUser()),
  delistPost: vi.fn(),
  resolveRequestHelp: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser, getApprovedUser }));
vi.mock("./post-repository", () => ({ delistPost, resolveRequestHelp }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { confirmReceived, delistMyPost, reportNotReceived } from "./actions";

const POST_ID = "123e4567-e89b-42d3-a456-426614174000";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("delistMyPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovedUser.mockImplementation(() => getCurrentUser());
  });

  it("未登录返回错误,不调用仓储", async () => {
    getCurrentUser.mockResolvedValue(null);
    const state = await delistMyPost({}, form({ postId: "p1" }));
    expect(state.error).toBeTruthy();
    expect(delistPost).not.toHaveBeenCalled();
  });

  it("待审核用户不能下架帖子", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    getApprovedUser.mockResolvedValue(null);
    const state = await delistMyPost({}, form({ postId: POST_ID }));
    expect(state.error).toBe("请先审核通过后再操作");
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

describe("confirmReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovedUser.mockImplementation(() => getCurrentUser());
  });

  it("未登录时拒绝确认", async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(confirmReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: "请先登录",
    });
    expect(resolveRequestHelp).not.toHaveBeenCalled();
  });

  it("待审核用户不能确认收到", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    getApprovedUser.mockResolvedValue(null);
    await expect(confirmReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: "请先审核通过后再操作",
    });
    expect(resolveRequestHelp).not.toHaveBeenCalled();
  });

  it("postId 不是 UUID 时拒绝确认", async () => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });

    await expect(confirmReceived({}, form({ postId: "not-a-uuid" }))).resolves.toEqual({
      error: "参数无效",
    });
    expect(resolveRequestHelp).not.toHaveBeenCalled();
  });

  it("确认收到后刷新三个账户路径", async () => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });
    resolveRequestHelp.mockResolvedValue({
      status: "COMPLETED",
      confirmationMethod: "MANUAL",
    });

    await expect(confirmReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      success: "已确认收到",
    });
    expect(resolveRequestHelp).toHaveBeenCalledWith(POST_ID, "publisher", true);
    expect(revalidatePath).toHaveBeenCalledWith("/me");
    expect(revalidatePath).toHaveBeenCalledWith("/me/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/me/helped");
  });

  it.each([
    ["FORBIDDEN", "无权处理该求助"],
    ["NOT_PENDING", "该求助已处理或无需确认"],
  ])("将 %s 映射为可读错误", async (status, message) => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });
    resolveRequestHelp.mockResolvedValue({ status });

    await expect(confirmReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: message,
    });
  });

  it("服务异常时返回重试提示", async () => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });
    resolveRequestHelp.mockRejectedValue(new Error("database unavailable"));

    await expect(confirmReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: "确认失败，请稍后重试",
    });
  });
});

describe("reportNotReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovedUser.mockImplementation(() => getCurrentUser());
  });

  it("未登录或 postId 非法时不调用仓储", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(reportNotReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: "请先登录",
    });

    getCurrentUser.mockResolvedValue({ id: "publisher" });
    await expect(reportNotReceived({}, form({ postId: "invalid" }))).resolves.toEqual({
      error: "参数无效",
    });
    expect(resolveRequestHelp).not.toHaveBeenCalled();
  });

  it("待审核用户不能反馈未收到", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    getApprovedUser.mockResolvedValue(null);
    await expect(reportNotReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: "请先审核通过后再操作",
    });
    expect(resolveRequestHelp).not.toHaveBeenCalled();
  });

  it.each([
    ["REOPENED", "已反馈未收到，帖子已重新开放"],
    ["EXPIRED", "已反馈未收到，帖子已过期并退还信用"],
  ])("%s 后刷新三个账户路径", async (status, message) => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });
    resolveRequestHelp.mockResolvedValue({ status });

    await expect(reportNotReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      success: message,
    });
    expect(resolveRequestHelp).toHaveBeenCalledWith(POST_ID, "publisher", false);
    expect(revalidatePath).toHaveBeenCalledWith("/me");
    expect(revalidatePath).toHaveBeenCalledWith("/me/posts");
    expect(revalidatePath).toHaveBeenCalledWith("/me/helped");
  });

  it.each([
    ["FORBIDDEN", "无权处理该求助"],
    ["NOT_PENDING", "该求助已处理或无需确认"],
  ])("将 %s 映射为可读错误", async (status, message) => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });
    resolveRequestHelp.mockResolvedValue({ status });

    await expect(reportNotReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: message,
    });
  });

  it("服务异常时返回重试提示", async () => {
    getCurrentUser.mockResolvedValue({ id: "publisher" });
    resolveRequestHelp.mockRejectedValue(new Error("database unavailable"));

    await expect(reportNotReceived({}, form({ postId: POST_ID }))).resolves.toEqual({
      error: "反馈失败，请稍后重试",
    });
  });
});
