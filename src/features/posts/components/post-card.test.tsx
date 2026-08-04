import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostCard } from "./post-card";

vi.mock("@/features/posts/device/device-provider", () => ({
  useDeviceIdentity: () => ({ status: "ready", visitorId: "visitor-id-123", retry: vi.fn() }),
}));

const post = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE" as const,
  discount: 80 as const,
  pieceNumber: 6,
  payloadKind: "COMMAND" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

describe("PostCard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("点击卡片领取按钮只打开确认抽屉，不请求 API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PostCard post={post} />);

    fireEvent.click(screen.getByRole("button", { name: "领取" }));

    expect(await screen.findByText("确认领取拼图")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
