import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUser,
  rpc,
  revalidatePath,
  profileSingle,
  updateUserById,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  profileSingle: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
    auth: { admin: { updateUserById } },
  })),
}));

import {
  banUser,
  rejectUser,
  reopenUserReview,
  setUserPassword,
  unbanUser,
} from "./admin-actions";

function form(targetId = "user-1") {
  const data = new FormData();
  data.set("targetId", targetId);
  return data;
}

describe("用户管理 action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "admin-1" });
  });

  it("封禁成功并刷新管理页", async () => {
    rpc.mockResolvedValue({ data: { status: "BANNED" }, error: null });

    await expect(banUser({}, form())).resolves.toEqual({ success: "已封禁" });
    expect(rpc).toHaveBeenCalledWith("ban_user", {
      p_target: "user-1",
      p_admin: "admin-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("把自封禁错误映射为中文提示", async () => {
    rpc.mockResolvedValue({ data: { status: "SELF_FORBIDDEN" }, error: null });

    await expect(banUser({}, form("admin-1"))).resolves.toEqual({
      error: "不能封禁自己",
    });
  });

  it("解封成功", async () => {
    rpc.mockResolvedValue({ data: { status: "APPROVED" }, error: null });

    await expect(unbanUser({}, form())).resolves.toEqual({ success: "已解封" });
    expect(rpc).toHaveBeenCalledWith("unban_user", {
      p_target: "user-1",
      p_admin: "admin-1",
    });
  });

  it("拒绝时校验原因并传入拒绝 RPC", async () => {
    rpc.mockResolvedValue({ data: { status: "REJECTED" }, error: null });
    const data = form();
    data.set("reason", "微信群昵称与用户名不一致");

    await expect(rejectUser({}, data)).resolves.toEqual({ success: "已拒绝" });
    expect(rpc).toHaveBeenCalledWith("reject_user", {
      p_target: "user-1",
      p_admin: "admin-1",
      p_reason: "微信群昵称与用户名不一致",
    });
  });

  it("拒绝原因为空或超长时不调用 RPC", async () => {
    const empty = form();
    empty.set("reason", "   ");
    await expect(rejectUser({}, empty)).resolves.toEqual({
      error: "请填写拒绝原因",
    });

    const long = form();
    long.set("reason", "a".repeat(201));
    await expect(rejectUser({}, long)).resolves.toEqual({
      error: "拒绝原因不能超过 200 个字符",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("恢复已拒绝用户为待审核", async () => {
    rpc.mockResolvedValue({ data: { status: "PENDING" }, error: null });

    await expect(reopenUserReview({}, form())).resolves.toEqual({
      success: "已恢复待审核",
    });
    expect(rpc).toHaveBeenCalledWith("reopen_user_review", {
      p_target: "user-1",
      p_admin: "admin-1",
    });
  });

  it("管理员设置密码前校验两次输入并调用 Supabase Admin API", async () => {
    profileSingle
      .mockResolvedValueOnce({ data: { is_admin: true }, error: null })
      .mockResolvedValueOnce({ data: { is_admin: false }, error: null });
    updateUserById.mockResolvedValue({ error: null });
    const data = form();
    data.set("password", "new-password");
    data.set("confirmPassword", "new-password");

    await expect(setUserPassword({}, data)).resolves.toEqual({
      success: "密码已设置",
    });
    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      password: "new-password",
    });
  });

  it("密码不一致时不调用 Supabase", async () => {
    const data = form();
    data.set("password", "new-password");
    data.set("confirmPassword", "different-password");

    await expect(setUserPassword({}, data)).resolves.toEqual({
      error: "两次密码输入不一致",
    });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
