import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HallPostDto } from "@/features/posts/domain/types";
import { PostCard } from "./post-card";

vi.mock("@/features/posts/device/device-provider", () => ({
  useDeviceIdentity: () => ({ status: "ready", visitorId: "visitor-id-123", retry: vi.fn() }),
}));

const post: HallPostDto = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE",
  discount: 80,
  pieceNumber: 6,
  availablePayloadKinds: ["COMMAND"],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

describe("PostCard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    [["COMMAND"] as const, "仅有口令"],
    [["URL"] as const, "仅有链接"],
    [["COMMAND", "URL"] as const, "口令 + 链接"],
  ])("根据可用来源 %j 显示 %s", (availablePayloadKinds, label) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    render(<PostCard post={{ ...post, availablePayloadKinds: [...availablePayloadKinds] }} />);

    expect(screen.getByText(`${label} · 2分钟前`)).toBeInTheDocument();
  });

  it("显示参考稿标签、编号和获取按钮", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    render(<PostCard post={post} />);

    expect(screen.getByText("出/赠")).toBeInTheDocument();
    expect(screen.getByText("8折 · 第 6 号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一键获取" })).toHaveClass(
      "bg-blue-600",
    );
  });

  it("点击卡片领取按钮只打开确认抽屉，不请求 API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PostCard post={post} />);

    fireEvent.click(screen.getByRole("button", { name: "一键获取" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
