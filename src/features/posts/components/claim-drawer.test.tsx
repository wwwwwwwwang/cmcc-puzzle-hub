import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeviceIdentity } from "@/features/posts/device/device-provider";
import type { HallPostDto } from "@/features/posts/domain/types";
import { ClaimDrawer } from "./claim-drawer";

const GIVE_URL =
  "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html?targetUrl=https%3A%2F%2Fwx.10086.cn%2Fhlwyxhdhub%2Fact-wedrecharge%2F1024101716%3FgiveCard%3Dabc";

const identity: DeviceIdentity = {
  status: "ready",
  visitorId: "visitor-id-123",
  retry: vi.fn(),
};

vi.mock("@/features/posts/device/device-provider", () => ({
  useDeviceIdentity: () => identity,
}));

const commandPost: HallPostDto = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE",
  discount: 80,
  pieceNumber: 6,
  availablePayloadKinds: ["COMMAND"],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

const urlPost: HallPostDto = { ...commandPost, availablePayloadKinds: ["URL"] };
const dualPost: HallPostDto = {
  ...commandPost,
  availablePayloadKinds: ["COMMAND", "URL"],
};

function claimResponse(payloads: { command?: string; url?: string }) {
  return new Response(JSON.stringify({ payloads, idempotent: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDrawer(
  post: HallPostDto = commandPost,
  overrides: Partial<React.ComponentProps<typeof ClaimDrawer>> = {},
) {
  const onOpenChange = vi.fn();
  const onClaimed = vi.fn();
  const launchApp = vi.fn();
  const navigate = vi.fn();
  render(
    <ClaimDrawer
      post={post}
      open
      onOpenChange={onOpenChange}
      onClaimed={onClaimed}
      launchApp={launchApp}
      navigate={navigate}
      {...overrides}
    />,
  );
  return { onOpenChange, onClaimed, launchApp, navigate };
}

describe("ClaimDrawer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    identity.status = "ready";
    identity.visitorId = "visitor-id-123";
  });

  it("双来源帖子同时显示口令和链接领取动作", () => {
    renderDrawer(dualPost);

    expect(screen.getByRole("button", { name: "使用口令领取" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用链接领取" })).toBeInTheDocument();
  });

  it("打开抽屉和取消不会请求领取 API", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { onOpenChange } = renderDrawer();

    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("选择口令后才请求 API，复制成功后移除卡片并唤起 APP", async () => {
    const fetchSpy = vi.fn(async () => claimResponse({ command: "￥19uSvG￥" }));
    vi.stubGlobal("fetch", fetchSpy);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { launchApp, onClaimed } = renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "使用口令领取" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/posts/${commandPost.id}/claim`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ visitorId: "visitor-id-123" }),
      }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("￥19uSvG￥"));
    expect(onClaimed).toHaveBeenCalledWith(commandPost.id);
    expect(launchApp).toHaveBeenCalledWith("leadeon://");
    expect(screen.getByText("若未自动跳转，请手动打开中国移动 APP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再次唤起" })).toBeInTheDocument();
  });

  it("复制失败时显示口令和备用链接，改用链接不重复请求 API", async () => {
    const fetchSpy = vi.fn(async () =>
      claimResponse({ command: "￥19uSvG￥", url: GIVE_URL }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const writeText = vi.fn(async () => {
      throw new Error("clipboard denied");
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { launchApp, navigate } = renderDrawer(dualPost);

    fireEvent.click(screen.getByRole("button", { name: "使用口令领取" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("复制失败"));
    expect(screen.getByText("￥19uSvG￥")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制口令" })).toBeInTheDocument();
    expect(launchApp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "改用链接" }));

    expect(navigate).toHaveBeenCalledWith(GIVE_URL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("选择链接后只在白名单 URL 通过校验后跳转", async () => {
    const fetchSpy = vi.fn(async () => claimResponse({ url: GIVE_URL }));
    vi.stubGlobal("fetch", fetchSpy);
    const { navigate, onClaimed } = renderDrawer(urlPost);

    fireEvent.click(screen.getByRole("button", { name: "使用链接领取" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(GIVE_URL));
    expect(onClaimed).toHaveBeenCalledWith(urlPost.id);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ALREADY_CLAIMED 移除卡片，SELF_CLAIM_FORBIDDEN 保留卡片", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "ALREADY_CLAIMED" } }), { status: 409 }),
      ),
    );
    const { onClaimed } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "使用口令领取" }));
    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1));

    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "SELF_CLAIM_FORBIDDEN" } }), { status: 403 }),
      ),
    );
    const second = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "使用口令领取" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("不能领取自己发布的内容"),
    );
    expect(second.onClaimed).not.toHaveBeenCalled();
  });

  it("网络错误保留抽屉并允许原地重试", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(claimResponse({ command: "￥19uSvG￥" }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "使用口令领取" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("网络连接失败"));
    fireEvent.click(screen.getByRole("button", { name: "使用口令领取" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
