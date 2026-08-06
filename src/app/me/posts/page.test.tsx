import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyPosts } = vi.hoisted(() => ({ getMyPosts: vi.fn() }));

vi.mock("@/features/posts/server/user-queries", () => ({ getMyPosts }));
vi.mock("@/features/posts/components/delist-button", () => ({
  DelistButton: ({ postId }: { postId: string }) => (
    <button>下架 {postId}</button>
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
});
