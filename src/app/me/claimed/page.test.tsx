import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyClaimedPosts } = vi.hoisted(() => ({
  getMyClaimedPosts: vi.fn(),
}));

vi.mock("@/features/posts/server/user-queries", () => ({ getMyClaimedPosts }));

import ClaimedPostsPage from "./page";

describe("ClaimedPostsPage", () => {
  afterEach(cleanup);

  it("空数据时显示返回链接和空状态", async () => {
    getMyClaimedPosts.mockResolvedValue([]);

    render(await ClaimedPostsPage());

    expect(
      screen.getByRole("link", { name: "返回我的账户" }),
    ).toHaveAttribute("href", "/me");
    expect(screen.getByRole("status")).toHaveTextContent(
      "还没有领取过拼图",
    );
  });

  it("展示可换行的口令与外部链接", async () => {
    getMyClaimedPosts.mockResolvedValue([
      {
        id: "claimed",
        type: "GIVE",
        discount: 80,
        pieceNumber: 3,
        payloads: {
          command: "长口令内容",
          url: "https://example.com/puzzle",
        },
      },
    ]);

    render(await ClaimedPostsPage());

    expect(screen.getByText("长口令内容")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://example.com/puzzle" }),
    ).toHaveAttribute("target", "_blank");
  });
});
