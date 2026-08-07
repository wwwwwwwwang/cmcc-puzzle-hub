import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GIVE_URL } from "../../../../tests/fixtures/cmcc-samples";
import type { HallPostDto } from "@/features/posts/domain/types";
import { ClaimDrawer } from "./claim-drawer";

const push = vi.fn();
const authSession = { isAuthenticated: true, publicId: "U-0123456789ABCDEF" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/features/auth/auth-session", () => ({
  useAuthSession: () => authSession,
}));

const urlPost: HallPostDto = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE",
  publisherId: "U-FEDCBA9876543210",
  discount: 80,
  pieceNumber: 6,
  availablePayloadKinds: ["URL"],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

function claimResponse(payloads: { url?: string }) {
  return new Response(JSON.stringify({ payloads, idempotent: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDrawer(
  post: HallPostDto = urlPost,
  overrides: Partial<React.ComponentProps<typeof ClaimDrawer>> = {},
) {
  const onOpenChange = vi.fn();
  const onClaimed = vi.fn();
  const navigate = vi.fn();
  render(
    <ClaimDrawer
      post={post}
      open
      onOpenChange={onOpenChange}
      onClaimed={onClaimed}
      navigate={navigate}
      {...overrides}
    />,
  );
  return { onOpenChange, onClaimed, navigate };
}

describe("ClaimDrawer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    push.mockReset();
    authSession.isAuthenticated = true;
  });

  it("只显示二维码链接领取动作，不显示口令入口", () => {
    renderDrawer();

    expect(screen.getByRole("button", { name: "使用链接领取" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /口令/ })).not.toBeInTheDocument();
    expect(screen.queryByText("请选择领取方式")).not.toBeInTheDocument();
  });

  it("根据帖子类型显示领取或助力标题", () => {
    renderDrawer();
    expect(screen.getByText("领取 8折 6 号拼图")).toBeInTheDocument();

    cleanup();
    renderDrawer({ ...urlPost, type: "REQUEST" });
    expect(screen.getByText("助力 8折 6 号拼图")).toBeInTheDocument();
  });

  it("未登录点击二维码领取跳转登录页,不请求 API", () => {
    authSession.isAuthenticated = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "使用链接领取" }));
    expect(push).toHaveBeenCalledWith("/login?redirect=/");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("成功领取后校验 URL 并导航，移除大厅卡片", async () => {
    const fetchSpy = vi.fn(async () => claimResponse({ url: GIVE_URL }));
    vi.stubGlobal("fetch", fetchSpy);
    const { navigate, onClaimed } = renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "使用链接领取" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(GIVE_URL));
    expect(onClaimed).toHaveBeenCalledWith(urlPost.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/posts/${urlPost.id}/claim`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("助力成功后显示等待确认状态", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          payloads: { url: GIVE_URL },
          idempotent: false,
          confirmationDeadline: "2026-08-07T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    renderDrawer({ ...urlPost, type: "REQUEST" });

    fireEvent.click(screen.getByRole("button", { name: "使用链接助力" }));

    await waitFor(() =>
      expect(screen.getByText("助力已提交，等待对方确认")).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/help"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("响应缺少 URL 时显示结果无效且不导航", async () => {
    const fetchSpy = vi.fn(async () => claimResponse({}));
    vi.stubGlobal("fetch", fetchSpy);
    const { navigate } = renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "使用链接领取" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("领取结果无效"),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ALREADY_CLAIMED 移除卡片，SELF_CLAIM_FORBIDDEN 保留错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "ALREADY_CLAIMED" } }), {
          status: 409,
        }),
      ),
    );
    const { onClaimed } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "使用链接领取" }));
    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1));

    cleanup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "SELF_CLAIM_FORBIDDEN" } }), {
          status: 403,
        }),
      ),
    );
    const second = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "使用链接领取" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("不能领取自己发布的内容"),
    );
    expect(second.onClaimed).not.toHaveBeenCalled();
  });
});
