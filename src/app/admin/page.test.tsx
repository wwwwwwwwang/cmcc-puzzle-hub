import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isCurrentUserAdmin, listUsers, notFound, userStatuses, userPageSize } = vi.hoisted(() => ({
  isCurrentUserAdmin: vi.fn(),
  listUsers: vi.fn(),
  userStatuses: ["PENDING", "APPROVED", "REJECTED", "BANNED"],
  userPageSize: 20,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/admin", () => ({
  isCurrentUserAdmin,
  listUsers,
  USER_STATUSES: userStatuses,
  USER_PAGE_SIZE: userPageSize,
}));
vi.mock("@/features/auth/components/user-management-actions", () => ({
  UserManagementActions: ({ targetId }: { targetId: string }) => (
    <div>管理 {targetId}</div>
  ),
}));

import AdminPage from "./page";

describe("AdminPage", () => {
  afterEach(cleanup);

  it("非管理员继续返回 404", async () => {
    isCurrentUserAdmin.mockResolvedValue(false);

    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(notFound).toHaveBeenCalledOnce();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("管理员默认查看全部用户且不在列表展示封禁说明", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listUsers.mockResolvedValue({ users: [], total: 0, page: 1, pageSize: 20 });

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "用户管理" })).toBeInTheDocument();
    expect(screen.queryByText(/开放帖子会下架/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("暂无用户");
    expect(listUsers).toHaveBeenCalledWith(null, "", 1, 20);
  });

  it("按状态筛选并显示用户资料与同 IP 风险", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listUsers.mockResolvedValue({
      users: [
      {
        id: "user-1",
        username: "测试用户",
        publicId: "U-1",
        credits: 3,
        status: "BANNED",
        isAdmin: false,
        registrationIp: "127.0.0.1",
        sameIpCount: 2,
        createdAt: "2026-08-07T00:00:00Z",
      },
      ],
      total: 41,
      page: 2,
      pageSize: 20,
    });

    render(
      await AdminPage({
        searchParams: Promise.resolve({ status: "BANNED", search: "测试", page: "2" }),
      }),
    );

    expect(listUsers).toHaveBeenCalledWith("BANNED", "测试", 2, 20);
    expect(screen.getByRole("searchbox", { name: "搜索用户名" })).toHaveValue("测试");
    expect(screen.getByText("测试用户")).toBeInTheDocument();
    expect(screen.getByText("U-1")).toBeInTheDocument();
    expect(screen.getByText("信用 3")).toBeInTheDocument();
    expect(screen.getByText("同 IP 2 个账号")).toBeInTheDocument();
    expect(screen.getByText("管理 user-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "上一页" })).toHaveAttribute(
      "href",
      "/admin?status=BANNED&search=%E6%B5%8B%E8%AF%95",
    );
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      "/admin?status=BANNED&search=%E6%B5%8B%E8%AF%95&page=3",
    );
  });
});
