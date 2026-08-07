import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyHelpedPosts } = vi.hoisted(() => ({ getMyHelpedPosts: vi.fn() }));

vi.mock("@/features/posts/server/user-queries", () => ({ getMyHelpedPosts }));
vi.mock("@/features/posts/components/confirmation-countdown", () => ({
  ConfirmationCountdown: ({ deadline }: { deadline: string }) => (
    <time>剩余时间 {deadline}</time>
  ),
}));
vi.mock("@/features/posts/components/helped-payload-actions", () => ({
  HelpedPayloadActions: ({ payloads }: { payloads: { url?: string } }) => (
    <button>打开二维码 {payloads.url}</button>
  ),
}));
vi.mock("@/features/posts/components/account-activity-refresh", () => ({
  AccountActivityRefresh: () => <button>刷新状态</button>,
}));

import HelpedPostsPage from "./page";

describe("HelpedPostsPage", () => {
  afterEach(cleanup);

  it("空数据时显示返回链接和空状态", async () => {
    getMyHelpedPosts.mockResolvedValue([]);

    render(await HelpedPostsPage());

    expect(screen.getByRole("link", { name: "返回我的账户" })).toHaveAttribute(
      "href",
      "/me",
    );
    expect(screen.getByRole("status")).toHaveTextContent("还没有帮助过求助");
  });

  it("展示等待确认、完成方式和未收到历史", async () => {
    getMyHelpedPosts.mockResolvedValue([
      {
        attemptId: "pending",
        postId: "post-pending",
        discount: 80,
        pieceNumber: 1,
        payloads: { url: "https://h.app.coc.10086.cn/pending" },
        status: "PENDING",
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod: null,
      },
      {
        attemptId: "completed",
        postId: "post-completed",
        discount: 90,
        pieceNumber: 2,
        payloads: { url: "https://h.app.coc.10086.cn/completed" },
        status: "COMPLETED",
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod: "AUTO",
      },
      {
        attemptId: "rejected",
        postId: "post-rejected",
        discount: 95,
        pieceNumber: 3,
        payloads: { url: "https://h.app.coc.10086.cn/rejected" },
        status: "REJECTED",
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod: null,
      },
    ]);

    render(await HelpedPostsPage());

    expect(screen.getByText("等待对方确认")).toBeInTheDocument();
    expect(screen.getByText("对方已自动确认收到")).toBeInTheDocument();
    expect(screen.getByText("对方未收到，本次助力未完成")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /打开二维码 https:\/\/h\.app/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeInTheDocument();
    expect(screen.queryByText("再次助力")).not.toBeInTheDocument();
  });
});
