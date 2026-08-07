import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../admin-actions", () => ({
  approveUser: vi.fn(async () => ({})),
  rejectUser: vi.fn(async () => ({})),
}));

import { ReviewButtons } from "./review-buttons";

describe("ReviewButtons", () => {
  afterEach(cleanup);

  it("将审核操作分组并允许窄屏换行", () => {
    render(<ReviewButtons targetId="user-1" />);

    const group = screen.getByRole("group", { name: "审核操作" });
    expect(group).toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "通过" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
  });

  it("点击拒绝后要求填写用户可见原因并允许取消", () => {
    render(<ReviewButtons targetId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    const reason = screen.getByRole("textbox", { name: "拒绝原因" });
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute("maxlength", "200");
    expect(screen.getByText(/该原因会在用户登录时显示/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认拒绝" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("textbox", { name: "拒绝原因" })).not.toBeInTheDocument();
  });
});
