import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../admin-actions", () => ({
  setUserPassword: vi.fn(async () => ({})),
}));

import { PasswordSetControl } from "./password-set-control";

describe("PasswordSetControl", () => {
  afterEach(cleanup);

  it("展开后显示两次密码输入", () => {
    render(<PasswordSetControl targetId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "设置密码" }));

    expect(screen.getByLabelText("新密码")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("确认新密码")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "保存密码" })).toBeInTheDocument();
  });
});
