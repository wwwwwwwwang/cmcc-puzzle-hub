import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./post-card", () => ({
  PostCard: ({ post }: { post: { id: string } }) => (
    <article>{post.id}</article>
  ),
}));

import { PostFeed } from "./post-feed";

const post = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE" as const,
  discount: 80 as const,
  pieceNumber: 6,
  availablePayloadKinds: ["COMMAND" as const],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

describe("PostFeed", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("按 20 条加载并支持 opaque cursor 加载更多", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [post], nextCursor: "opaque-cursor" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...post, id: post.id + "-2" }], nextCursor: null })));
    vi.stubGlobal("fetch", fetchSpy);
    render(<PostFeed type="GIVE" discount={80} pieceNumber={6} />);

    expect(await screen.findByText(post.id)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/posts?limit=20&type=GIVE&discount=80&pieceNumber=6",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText("最新发布")).toBeInTheDocument();
    expect(screen.getByText("共 1 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[1][0]).toContain("cursor=opaque-cursor");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText(`${post.id}-2`)).toBeInTheDocument();
  });

  it("刷新按钮重新请求第一页并清空旧游标", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [post], nextCursor: "opaque" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], nextCursor: null })),
      );
    vi.stubGlobal("fetch", fetchSpy);
    render(<PostFeed discount={80} />);

    await screen.findByText("共 1 条");
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(
      await screen.findByText("当前条件下暂无数据，试试其他拼图吧"),
    ).toBeInTheDocument();
    expect(fetchSpy.mock.calls[1][0]).not.toContain("cursor=");
  });

  it("首次请求期间显示参考稿加载状态", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<PostFeed />);

    expect(screen.getByText("正在寻找最新的拼图...")).toBeInTheDocument();
  });

  it("显示空态与失败重试", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null })));
    vi.stubGlobal("fetch", fetchSpy);
    render(<PostFeed />);
    expect(
      await screen.findByText("当前条件下暂无数据，试试其他拼图吧"),
    ).toBeInTheDocument();

    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    render(<PostFeed />);
    expect(await screen.findByText("加载失败，请重试")).toBeInTheDocument();
  });

  it("筛选变化时取消旧请求并重置列表", async () => {
    let firstSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("type=GIVE")) {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null })));
    });
    vi.stubGlobal("fetch", fetchSpy);
    const view = render(<PostFeed type="GIVE" />);
    await waitFor(() => expect(firstSignal).toBeDefined());

    view.rerender(<PostFeed type="REQUEST" />);

    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    expect(
      await screen.findByText("当前条件下暂无数据，试试其他拼图吧"),
    ).toBeInTheDocument();
  });
});
