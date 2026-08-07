import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({
  signUp: vi.fn(),
}));

vi.mock("@/features/auth/components/auth-form", () => ({
  AuthForm: ({ submitLabel }: { submitLabel: string }) => (
    <form aria-label="注册表单">
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

import RegisterPage from "./page";

describe("RegisterPage", () => {
  afterEach(cleanup);

  it("使用认证页容器并展示审核信用说明", async () => {
    render(
      await RegisterPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "注册" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "注册表单" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "注册说明" })).toHaveTextContent(
      "审核通过即获得 3 点信用",
    );
  });

  it("登录链接继续携带 redirect 参数", async () => {
    render(
      await RegisterPage({
        searchParams: Promise.resolve({ redirect: "/me" }),
      }),
    );

    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fme",
    );
  });
});
