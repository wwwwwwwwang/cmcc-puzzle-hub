import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCreditOverview, getAccountActivity, getAuthSession } = vi.hoisted(() => ({
  getCreditOverview: vi.fn(),
  getAccountActivity: vi.fn(),
  getAuthSession: vi.fn(),
}));

vi.mock("@/features/posts/server/user-queries", () => ({
  getCreditOverview,
  getAccountActivity,
}));
vi.mock("@/lib/supabase/server", () => ({ getAuthSession }));
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/features/auth/components/sign-out-control", () => ({
  SignOutControl: () => <button type="button">退出登录</button>,
}));

import MePage from "./page";

describe("MePage", () => {
  afterEach(cleanup);

  it("普通用户显示账户概览和三个入口", async () => {
    getCreditOverview.mockResolvedValue({
      credits: 2,
      publicId: "U-TEST",
      ledger: [],
    });
    getAccountActivity.mockResolvedValue({
      pendingConfirmationCount: 2,
      pendingHelpCount: 1,
      version: "v1",
    });
    getAuthSession.mockResolvedValue({ isAdmin: false });

    render(await MePage());

    expect(screen.getByText("U-TEST")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: /我帮助的/ })).toHaveAttribute(
      "href",
      "/me/helped",
    );
    expect(screen.getByText("2 项待确认")).toBeInTheDocument();
    expect(screen.getByText("管理发布与状态")).toBeInTheDocument();
    expect(screen.getByText("查看口令与链接")).toBeInTheDocument();
    expect(screen.getByText("查看助力与确认")).toBeInTheDocument();
    expect(screen.getByLabelText("信用概览")).toHaveTextContent(
      "发布求助托管 1 点",
    );
    expect(
      screen.queryByRole("link", { name: /用户审核/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "退出登录" }),
    ).toBeInTheDocument();
  });

  it("管理员额外显示用户审核入口", async () => {
    getCreditOverview.mockResolvedValue({
      credits: 0,
      publicId: "U-ADMIN",
      ledger: [],
    });
    getAccountActivity.mockResolvedValue({
      pendingConfirmationCount: 0,
      pendingHelpCount: 0,
      version: "v1",
    });
    getAuthSession.mockResolvedValue({ isAdmin: true });

    render(await MePage());

    expect(screen.getByRole("link", { name: /用户审核/ })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("展示求助托管相关信用流水名称", async () => {
    getCreditOverview.mockResolvedValue({
      credits: 1,
      publicId: "U-LEDGER",
      ledger: [
        { id: 1, delta: -1, reason: "ESCROW_REQUEST" },
        { id: 2, delta: 1, reason: "EARN_HELP_CONFIRMED" },
        { id: 3, delta: 1, reason: "REFUND_REQUEST" },
      ],
    });
    getAccountActivity.mockResolvedValue({
      pendingConfirmationCount: 0,
      pendingHelpCount: 0,
      version: "v1",
    });
    getAuthSession.mockResolvedValue({ isAdmin: false });

    render(await MePage());

    expect(screen.getByText("发布求助托管")).toBeInTheDocument();
    expect(screen.getByText("帮助确认奖励")).toBeInTheDocument();
    expect(screen.getByText("求助信用退还")).toBeInTheDocument();
  });
});
