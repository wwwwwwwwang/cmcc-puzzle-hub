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

import { banUser, setUserPassword, unbanUser } from "./admin-actions";

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
