import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isCurrentUserAdmin, listUsers, notFound, userStatuses } = vi.hoisted(() => ({
  isCurrentUserAdmin: vi.fn(),
  listUsers: vi.fn(),
  userStatuses: ["PENDING", "APPROVED", "REJECTED", "BANNED"],
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/admin", () => ({
  isCurrentUserAdmin,
  listUsers,
  USER_STATUSES: userStatuses,
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

  it("管理员默认查看全部用户并展示封禁影响说明", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listUsers.mockResolvedValue([]);

    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "用户管理" })).toBeInTheDocument();
    expect(screen.getByText(/开放帖子会下架/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("暂无用户");
    expect(listUsers).toHaveBeenCalledWith(null);
  });

  it("按状态筛选并显示用户资料与同 IP 风险", async () => {
    isCurrentUserAdmin.mockResolvedValue(true);
    listUsers.mockResolvedValue([
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
    ]);

    render(
      await AdminPage({
        searchParams: Promise.resolve({ status: "BANNED" }),
      }),
    );

    expect(listUsers).toHaveBeenCalledWith("BANNED");
    expect(screen.getByText("测试用户")).toBeInTheDocument();
    expect(screen.getByText("U-1")).toBeInTheDocument();
    expect(screen.getByText("信用 3")).toBeInTheDocument();
    expect(screen.getByText("同 IP 2 个账号")).toBeInTheDocument();
    expect(screen.getByText("管理 user-1")).toBeInTheDocument();
  });
});
