import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/publish",
}));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  afterEach(cleanup);

  it("使用移动端宽度、全视口高度和安全区底栏", () => {
    const { container } = render(<AppShell>content</AppShell>);
    const shell = container.firstElementChild;

    expect(shell).toHaveClass("min-h-dvh", "max-w-[420px]");
    expect(screen.getByRole("main")).toHaveClass(
      "pb-[calc(4rem+env(safe-area-inset-bottom))]",
    );
    expect(screen.getByRole("navigation", { name: "主要导航" })).toHaveClass(
      "max-w-[420px]",
      "pb-[env(safe-area-inset-bottom)]",
    );
  });

  it("底栏包含大厅、发布和我的并标记活动项", () => {
    render(<AppShell>content</AppShell>);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["大厅", "发布", "我的"]);
    expect(screen.getByRole("link", { name: "发布" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
