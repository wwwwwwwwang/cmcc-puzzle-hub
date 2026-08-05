import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { authSession } = vi.hoisted(() => ({
  authSession: {
    isAuthenticated: false,
    publicId: null as string | null,
  },
}));

vi.mock("@/features/auth/auth-session", () => ({
  useAuthSession: () => authSession,
}));

import { CurrentUserBadge } from "./current-user-badge";

describe("CurrentUserBadge", () => {
  afterEach(() => {
    cleanup();
    authSession.isAuthenticated = false;
    authSession.publicId = null;
  });

  it("未登录显示登录/注册入口", () => {
    render(<CurrentUserBadge />);
    const link = screen.getByRole("link", { name: "登录 / 注册" });
    expect(link).toHaveAttribute("href", "/login?redirect=/");
  });

  it("已登录显示当前用户公开 ID", () => {
    authSession.isAuthenticated = true;
    authSession.publicId = "U-0123456789ABCDEF";

    render(<CurrentUserBadge />);

    expect(screen.getByText("当前用户")).toBeInTheDocument();
    expect(screen.getByText("U-0123456789ABCDEF")).toBeInTheDocument();
  });
});
