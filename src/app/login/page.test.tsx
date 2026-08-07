import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({
  signIn: vi.fn(),
}));

vi.mock("@/features/auth/components/auth-form", () => ({
  AuthForm: ({ submitLabel }: { submitLabel: string }) => (
    <form aria-label="登录表单">
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  afterEach(cleanup);

  it("使用认证页容器并保留登录表单入口", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "登录表单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("注册链接继续携带 redirect 参数", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ redirect: "/publish" }),
      }),
    );

    expect(screen.getByRole("link", { name: "注册" })).toHaveAttribute(
      "href",
      "/register?redirect=%2Fpublish",
    );
  });
});
