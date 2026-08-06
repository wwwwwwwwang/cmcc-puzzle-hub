import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyPosts } = vi.hoisted(() => ({ getMyPosts: vi.fn() }));

vi.mock("@/features/posts/server/user-queries", () => ({ getMyPosts }));
vi.mock("@/features/posts/components/delist-button", () => ({
  DelistButton: ({ postId }: { postId: string }) => (
    <button>下架 {postId}</button>
  ),
}));
vi.mock("@/features/posts/components/request-help-actions", () => ({
  RequestHelpActions: ({ postId }: { postId: string }) => (
    <div>
      <button>确认已收到</button>
      <button>未收到 {postId}</button>
    </div>
  ),
}));
vi.mock("@/features/posts/components/confirmation-countdown", () => ({
  ConfirmationCountdown: ({ deadline }: { deadline: string }) => (
    <time>倒计时 {deadline}</time>
  ),
}));

import MyPostsPage from "./page";

describe("MyPostsPage", () => {
  afterEach(cleanup);

  it("空数据时显示返回链接和空状态", async () => {
    getMyPosts.mockResolvedValue([]);

    render(await MyPostsPage());

    expect(
      screen.getByRole("link", { name: "返回我的账户" }),
    ).toHaveAttribute("href", "/me");
    expect(screen.getByRole("status")).toHaveTextContent(
      "还没有发布过拼图",
    );
  });

  it("只有可领取帖子显示下架操作", async () => {
    getMyPosts.mockResolvedValue([
      {
        id: "open",
        type: "GIVE",
        discount: 80,
        pieceNumber: 1,
        status: "OPEN",
      },
      {
        id: "claimed",
        type: "REQUEST",
        discount: 90,
        pieceNumber: 2,
        status: "CLAIMED",
      },
    ]);

    render(await MyPostsPage());

    expect(
      screen.getByRole("button", { name: "下架 open" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下架 claimed" }),
    ).not.toBeInTheDocument();
  });

  it("求助待确认时展示倒计时和收货操作", async () => {
    getMyPosts.mockResolvedValue([
      {
        id: "pending",
        type: "REQUEST",
        discount: 90,
        pieceNumber: 4,
        status: "PENDING_CONFIRM",
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod: null,
      },
    ]);

    render(await MyPostsPage());

    expect(screen.getByText("等待你确认")).toBeInTheDocument();
    expect(screen.getByText("24 小时后自动确认")).toBeInTheDocument();
    expect(screen.getByText(/倒计时 2026-08-07/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认已收到" })).toBeInTheDocument();
  });

  it.each([
    ["MANUAL", "已主动确认收到"],
    ["AUTO", "已自动确认收到"],
  ])("完成求助显示 %s 确认结果", async (confirmationMethod, label) => {
    getMyPosts.mockResolvedValue([
      {
        id: `completed-${confirmationMethod}`,
        type: "REQUEST",
        discount: 80,
        pieceNumber: 6,
        status: "COMPLETED",
        confirmationDeadline: "2026-08-07T00:00:00.000Z",
        confirmationMethod,
      },
    ]);

    render(await MyPostsPage());

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
