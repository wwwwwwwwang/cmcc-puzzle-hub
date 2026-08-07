import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../admin-actions", () => ({
  approveUser: vi.fn(async () => ({})),
  rejectUser: vi.fn(async () => ({})),
  banUser: vi.fn(async () => ({})),
  unbanUser: vi.fn(async () => ({})),
  reopenUserReview: vi.fn(async () => ({})),
  setUserPassword: vi.fn(async () => ({})),
}));

import { UserManagementActions } from "./user-management-actions";

describe("UserManagementActions", () => {
  afterEach(cleanup);

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("待审核用户保留通过和拒绝操作", () => {
    render(<UserManagementActions targetId="u1" status="PENDING" isAdmin={false} />);

    expect(screen.getByRole("button", { name: "通过" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
  });

  it("已通过用户显示封禁但不常驻显示影响说明", () => {
    render(<UserManagementActions targetId="u1" status="APPROVED" isAdmin={false} />);

    expect(screen.getByRole("button", { name: "封禁" })).toBeInTheDocument();
    expect(screen.queryByText(/开放帖子会下架/)).not.toBeInTheDocument();
  });

  it("取消封禁确认时阻止提交", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<UserManagementActions targetId="u1" status="APPROVED" isAdmin={false} />);

    const form = screen.getByRole("button", { name: "封禁" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("开放帖子会下架"));
  });

  it("已封禁用户显示解封,管理员账号不显示封禁", () => {
    const { rerender } = render(
      <UserManagementActions targetId="u1" status="BANNED" isAdmin={false} />,
    );
    expect(screen.getByRole("button", { name: "解封" })).toBeInTheDocument();

    rerender(
      <UserManagementActions targetId="admin-1" status="APPROVED" isAdmin />,
    );
    expect(screen.queryByRole("button", { name: "封禁" })).not.toBeInTheDocument();
  });

  it("已拒绝用户显示原因和恢复待审核操作", () => {
    render(
      <UserManagementActions
        targetId="u1"
        status="REJECTED"
        isAdmin={false}
        rejectionReason="微信群昵称与用户名不一致"
      />,
    );

    expect(screen.getByText("微信群昵称与用户名不一致")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复待审核" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "通过" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
  });
});
