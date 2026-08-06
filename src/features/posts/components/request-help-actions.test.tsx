import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { confirmReceived, reportNotReceived } = vi.hoisted(() => ({
  confirmReceived: vi.fn(async () => ({})),
  reportNotReceived: vi.fn(async () => ({})),
}));

vi.mock("@/features/posts/server/actions", () => ({
  confirmReceived,
  reportNotReceived,
}));

import { RequestHelpActions } from "./request-help-actions";

const POST_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("RequestHelpActions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("确认已收到时直接提交帖子 ID", async () => {
    render(<RequestHelpActions postId={POST_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "确认已收到" }));

    await waitFor(() => expect(confirmReceived).toHaveBeenCalledTimes(1));
    const submitted = confirmReceived.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("postId")).toBe(POST_ID);
  });

  it("取消未收到确认时不提交", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RequestHelpActions postId={POST_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "未收到" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "确认未收到拼图？帖子将重新开放。",
    );
    expect(reportNotReceived).not.toHaveBeenCalled();
  });

  it("确认未收到后提交帖子 ID", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RequestHelpActions postId={POST_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "未收到" }));

    await waitFor(() => expect(reportNotReceived).toHaveBeenCalledTimes(1));
    const submitted = reportNotReceived.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("postId")).toBe(POST_ID);
  });

  it("任一操作进行中时禁用两个按钮", async () => {
    let finish!: () => void;
    confirmReceived.mockImplementationOnce(
      () => new Promise<Record<string, never>>((resolve) => {
        finish = () => resolve({});
      }),
    );
    render(<RequestHelpActions postId={POST_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "确认已收到" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确认中…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "未收到" })).toBeDisabled();
    });
    finish();
  });
});
