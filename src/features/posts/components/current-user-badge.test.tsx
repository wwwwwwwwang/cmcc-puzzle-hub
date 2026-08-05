import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { identity } = vi.hoisted(() => ({
  identity: {
    visitorId: "visitor-id-123",
    status: "ready",
    publicId: null as string | null,
    publicIdStatus: "loading",
    retry: vi.fn(),
  },
}));

vi.mock("@/features/posts/device/device-provider", () => ({
  useDeviceIdentity: () => identity,
}));

import { CurrentUserBadge } from "./current-user-badge";

describe("CurrentUserBadge", () => {
  afterEach(() => {
    cleanup();
    identity.publicId = null;
    identity.publicIdStatus = "loading";
  });

  it("加载中显示准备提示", () => {
    render(<CurrentUserBadge />);
    expect(screen.getByText("正在生成用户标识…")).toBeInTheDocument();
  });

  it("成功显示当前用户公开 ID", () => {
    identity.publicId = "U-0123456789ABCDEF";
    identity.publicIdStatus = "ready";

    render(<CurrentUserBadge />);

    expect(screen.getByText("当前用户")).toBeInTheDocument();
    expect(screen.getByText("U-0123456789ABCDEF")).toBeInTheDocument();
  });

  it("失败时显示非阻断降级提示", () => {
    identity.publicIdStatus = "error";

    render(<CurrentUserBadge />);

    expect(screen.getByText("身份标识暂不可用")).toBeInTheDocument();
  });
});
