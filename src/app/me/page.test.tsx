import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCreditOverview, getAuthSession } = vi.hoisted(() => ({
  getCreditOverview: vi.fn(),
  getAuthSession: vi.fn(),
}));

vi.mock("@/features/posts/server/user-queries", () => ({ getCreditOverview }));
vi.mock("@/lib/supabase/server", () => ({ getAuthSession }));

import MePage from "./page";

describe("MePage", () => {
  afterEach(cleanup);

  it("普通用户显示账户概览和两个入口", async () => {
    getCreditOverview.mockResolvedValue({
      credits: 2,
      publicId: "U-TEST",
      ledger: [],
    });
    getAuthSession.mockResolvedValue({ isAdmin: false });

    render(await MePage());

    expect(screen.getByLabelText("信用概览")).toHaveTextContent("2");
    expect(
      screen.getByRole("navigation", { name: "账户功能" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /我的帖子/ })).toHaveAttribute(
      "href",
      "/me/posts",
    );
    expect(screen.getByRole("link", { name: /我领取的/ })).toHaveAttribute(
      "href",
      "/me/claimed",
    );
    expect(screen.getByText("管理发布与状态")).toBeInTheDocument();
    expect(screen.getByText("查看口令与链接")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /用户审核/ }),
    ).not.toBeInTheDocument();
  });

  it("管理员额外显示用户审核入口", async () => {
    getCreditOverview.mockResolvedValue({
      credits: 0,
      publicId: "U-ADMIN",
      ledger: [],
    });
    getAuthSession.mockResolvedValue({ isAdmin: true });

    render(await MePage());

    expect(screen.getByRole("link", { name: /用户审核/ })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});
