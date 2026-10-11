import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/server/actions", () => ({
  delistMyPost: vi.fn(),
}));

import { DelistButton } from "./delist-button";

describe("DelistButton", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("取消确认时不提交下架", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<DelistButton postId="post-1" />);

    const form = screen.getByRole("button", { name: "下架" }).closest("form");
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(event);

    expect(confirm).toHaveBeenCalledWith(
      "确认下架这个帖子？下架后无法恢复。",
    );
    expect(event.defaultPrevented).toBe(true);
  });
});
