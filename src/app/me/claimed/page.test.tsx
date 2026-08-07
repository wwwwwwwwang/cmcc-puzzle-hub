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

  it("展示二维码链接且不显示口令", async () => {
    getMyClaimedPosts.mockResolvedValue([
      {
        id: "claimed",
        type: "GIVE",
        discount: 80,
        pieceNumber: 3,
        payloads: {
          url: "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html?targetUrl=https%3A%2F%2Fwx.10086.cn%2Fhlwyxhdhub%2Fact-wedrecharge%2F1024101716%3FgiveCard%3Dabc",
        },
      },
    ]);

    render(await ClaimedPostsPage());

    expect(screen.queryByText("长口令内容")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /h\.app\.coc\.10086\.cn/ }),
    ).toHaveAttribute("target", "_blank");
  });
});
