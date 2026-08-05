import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/components/post-feed", () => ({
  PostFeed: (props: Record<string, unknown>) => (
    <output aria-label="列表属性">{JSON.stringify(props)}</output>
  ),
}));

vi.mock("@/features/posts/components/post-filters", () => ({
  PostFilters: (props: Record<string, unknown>) => (
    <output aria-label="筛选属性">{JSON.stringify(props)}</output>
  ),
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

  it("默认使用 8 折并传递拼图编号筛选", async () => {
    const page = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ type: "REQUEST", pieceNumber: "6" }),
    });
    render(page);

    expect(screen.getByLabelText("筛选属性")).toHaveTextContent(
      JSON.stringify({ discount: 80, type: "REQUEST", pieceNumber: 6 }),
    );
    expect(screen.getByLabelText("列表属性")).toHaveTextContent(
      JSON.stringify({ discount: 80, type: "REQUEST", pieceNumber: 6 }),
    );
  });

  it("忽略不属于当前折扣的拼图编号", async () => {
    const page = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ discount: "95", pieceNumber: "6" }),
    });
    render(page);

    expect(screen.getByLabelText("筛选属性")).toHaveTextContent(
      JSON.stringify({ discount: 95, pieceNumber: null }),
    );
  });
});
