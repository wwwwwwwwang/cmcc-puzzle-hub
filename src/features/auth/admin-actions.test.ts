import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, rpc, revalidatePath } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ rpc })),
}));

import { banUser, unbanUser } from "./admin-actions";

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
});
