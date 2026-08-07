import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GIVE_URL, REQUEST_URL } from "../../../../tests/fixtures/cmcc-samples";
import { PublishPanel } from "./publish-panel";

const push = vi.fn();
const authSession = {
  isAuthenticated: true,
  isApproved: true,
  publicId: "U-0123456789ABCDEF",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/features/auth/auth-session", () => ({
  useAuthSession: () => authSession,
}));

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof PublishPanel>> = {},
) {
  return render(
    <PublishPanel
      postType="GIVE"
      discount={80}
      pieceNumber={6}
      {...overrides}
    />,
  );
}

function chooseQr() {
  fireEvent.change(screen.getByLabelText("选择二维码图片"), {
    target: {
      files: [new File(["png"], "puzzle.png", { type: "image/png" })],
    },
  });
}

describe("PublishPanel", () => {
  afterEach(() => {
    cleanup();
    push.mockReset();
    vi.unstubAllGlobals();
    authSession.isAuthenticated = true;
    authSession.isApproved = true;
  });

  it("只显示二维码来源并在无拼图选择时禁用上传", () => {
    renderPanel({ pieceNumber: null });

    expect(screen.queryByLabelText("拼图口令")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择二维码图片" })).toBeDisabled();
  });

  it("未选择类型时禁用二维码上传并提示先选类型", () => {
    renderPanel({ postType: null });

    expect(screen.getByRole("button", { name: "选择二维码图片" })).toBeDisabled();
    expect(screen.getByText("请先选择发布类型")).toBeInTheDocument();
  });

  it("识别真实赠送二维码后显示预览", async () => {
    renderPanel({ decodeImage: vi.fn(async () => GIVE_URL) });
    chooseQr();

    expect(await screen.findByText("8折6号·赠送")).toBeInTheDocument();
    expect(screen.getByText("二维码链接已识别")).toBeInTheDocument();
  });

  it("二维码类型与当前发布类型不一致时阻止发布", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel({ postType: "REQUEST", decodeImage: vi.fn(async () => GIVE_URL) });
    chooseQr();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "选择的是求助，但内容识别为赠送",
    );
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("发布失败保留二维码并显示中文错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "DUPLICATE_POST" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    renderPanel({ decodeImage: vi.fn(async () => GIVE_URL) });
    chooseQr();
    await screen.findByText("二维码链接已识别");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "该二维码对应的拼图已经发布过了",
    );
    expect(screen.getByText("二维码链接已识别")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("赠送发布请求体只包含二维码链接", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel({ decodeImage: vi.fn(async () => GIVE_URL) });
    chooseQr();
    await screen.findByText("二维码链接已识别");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      type: "GIVE",
      sources: { url: GIVE_URL },
    });
    expect(body.sources.command).toBeUndefined();
  });

  it("求助发布请求体保留显式类型", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel({
      postType: "REQUEST",
      pieceNumber: 1,
      decodeImage: vi.fn(async () => REQUEST_URL),
    });
    chooseQr();
    await screen.findByText("二维码链接已识别");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.type).toBe("REQUEST");
    expect(body.sources).toEqual({ url: REQUEST_URL });
  });

  it("未登录时隐藏发布按钮并显示去登录入口", () => {
    authSession.isAuthenticated = false;
    renderPanel();

    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去登录 / 注册" })).toHaveAttribute(
      "href",
      "/login?redirect=/publish",
    );
  });

  it("待审核用户显示只读提示并隐藏发布按钮", () => {
    authSession.isApproved = false;
    renderPanel();

    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(
      screen.getByText("账号待审核，当前仅可浏览；审核通过后才能发布。"),
    ).toBeInTheDocument();
  });
});
