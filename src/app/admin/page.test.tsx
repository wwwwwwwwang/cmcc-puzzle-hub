import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { isCurrentUserAdmin, listPendingUsers, notFound } = vi.hoisted(() => ({
  isCurrentUserAdmin: vi.fn(),
  listPendingUsers: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/admin", () => ({
  isCurrentUserAdmin,
  listPendingUsers,
}));
vi.mock("@/features/auth/components/review-buttons", () => ({
  ReviewButtons: ({ targetId }: { targetId: string }) => (
    <div>审核 {targetId}</div>
  ),
}));

import AdminPage from "./page";

describe("AdminPage", () => {
  afterEach(cleanup);

  it("非管理员继续返回 404", async () => {
    isCurrentUserAdmin.mockResolvedValue(false);

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledOnce();
    expect(listPendingUsers).not.toHaveBeenCalled();
  });

  it("管理员空数据时显示返回链接和空状态", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listPendingUsers.mockResolvedValue([]);

    render(await AdminPage());

    expect(
      screen.getByRole("link", { name: "返回我的账户" }),
    ).toHaveAttribute("href", "/me");
    expect(screen.getByRole("status")).toHaveTextContent("暂无待审核用户");
  });

  it("突出同 IP 多账号风险并保留审核操作", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listPendingUsers.mockResolvedValue([
      {
        id: "user-1",
        username: "测试用户",
        registrationIp: "127.0.0.1",
        sameIpCount: 2,
      },
    ]);

    render(await AdminPage());

    expect(screen.getByText("同 IP 2 个账号")).toBeInTheDocument();
    expect(screen.getByText("审核 user-1")).toBeInTheDocument();
  });
});
