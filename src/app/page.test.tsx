import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/components/post-feed", () => ({
  PostFeed: () => <div />,
}));

vi.mock("@/features/posts/components/post-filters", () => ({
  PostFilters: () => <div />,
}));

import Home from "./page";

describe("Home", () => {
  afterEach(cleanup);

  it("显示网站名称", async () => {
    const page = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "周三充值日拼图互助",
      }),
    ).toBeInTheDocument();
  });
});
