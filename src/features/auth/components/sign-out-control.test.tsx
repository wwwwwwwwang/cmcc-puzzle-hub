import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignOutControl } from "./sign-out-control";

const signOut = vi.fn(async () => undefined);

describe("SignOutControl", () => {
  afterEach(() => {
    cleanup();
    signOut.mockClear();
  });

  it("打开确认面板并可取消", async () => {
    render(<SignOutControl action={signOut} />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(screen.getByText("确认退出登录？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() =>
      expect(screen.queryByText("确认退出登录？")).not.toBeInTheDocument(),
    );
  });

  it("确认后提交现有登出 action", async () => {
    render(<SignOutControl action={signOut} />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
