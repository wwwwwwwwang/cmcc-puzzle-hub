import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GIVE_COMMAND,
  GIVE_URL,
  REQUEST_COMMAND,
} from "../../../../tests/fixtures/cmcc-samples";
import { PublishPanel } from "./publish-panel";

const push = vi.fn();
const authSession = { isAuthenticated: true, publicId: "U-0123456789ABCDEF" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/features/auth/auth-session", () => ({
  useAuthSession: () => authSession,
}));

function renderPanel(overrides: Partial<React.ComponentProps<typeof PublishPanel>> = {}) {
  return render(
    <PublishPanel
      postType="GIVE"
      discount={80}
      pieceNumber={6}
      {...overrides}
    />,
  );
}

describe("PublishPanel", () => {
  afterEach(() => {
    cleanup();
    push.mockReset();
    vi.unstubAllGlobals();
    authSession.isAuthenticated = true;
  });

  it("无拼图选择时禁用口令输入和图片按钮", () => {
    renderPanel({ pieceNumber: null });

    expect(screen.getByLabelText("拼图口令")).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "上传二维码" }));
    expect(screen.getByRole("button", { name: "选择二维码图片" })).toBeDisabled();
  });

  it("未选择类型时禁用内容输入并提示先选类型", () => {
    renderPanel({ postType: null });

    expect(screen.getByLabelText("拼图口令")).toBeDisabled();
    expect(screen.getByText("请先选择发布类型")).toBeInTheDocument();
  });

  it("粘贴真实赠送口令后显示预览", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("拼图口令"), {
      target: { value: GIVE_COMMAND },
    });

    expect(await screen.findByText("8折6号·赠送")).toBeInTheDocument();
  });

  it("切换标签时保留口令和二维码来源", async () => {
    renderPanel({ decodeImage: vi.fn(async () => GIVE_URL) });
    fireEvent.change(screen.getByLabelText("拼图口令"), {
      target: { value: GIVE_COMMAND },
    });
    fireEvent.click(screen.getByRole("tab", { name: "上传二维码" }));
    fireEvent.change(screen.getByLabelText("选择二维码图片"), {
      target: {
        files: [new File(["png"], "puzzle.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByText("将保存：口令 + 链接")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "粘贴口令" }));
    expect(screen.getByLabelText("拼图口令")).toHaveValue(GIVE_COMMAND);
  });

  it("当前选择不一致时显示错误且不请求 API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel({ pieceNumber: 1 });

    fireEvent.change(screen.getByLabelText("拼图口令"), {
      target: { value: GIVE_COMMAND },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("口令拼图与当前选择不一致");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("选择类型与内容类型不一致时阻止发布", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel({ postType: "REQUEST" });

    fireEvent.change(screen.getByLabelText("拼图口令"), {
      target: { value: GIVE_COMMAND },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "选择的是求助，但内容识别为赠送，请更换内容或发布类型",
    );
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("切换类型后保留内容并重新校验", async () => {
    const view = renderPanel();
    fireEvent.change(screen.getByLabelText("拼图口令"), {
      target: { value: GIVE_COMMAND },
    });
    expect(await screen.findByText("8折6号·赠送")).toBeInTheDocument();

    view.rerender(
      <PublishPanel postType="REQUEST" discount={80} pieceNumber={6} />,
    );

    expect(screen.getByLabelText("拼图口令")).toHaveValue(GIVE_COMMAND);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "选择的是求助，但内容识别为赠送",
    );
  });

  it("发布失败保留输入并显示中文错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "DUPLICATE_POST" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    renderPanel();
    const input = screen.getByLabelText("拼图口令");
    fireEvent.change(input, { target: { value: GIVE_COMMAND } });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("这条内容已经发布过了");
    expect(input).toHaveValue(GIVE_COMMAND);
    expect(push).not.toHaveBeenCalled();
  });

  it("发布成功后清空输入并导航大厅", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel();
    const input = screen.getByLabelText("拼图口令");
    fireEvent.change(input, { target: { value: GIVE_COMMAND } });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(input).toHaveValue("");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/posts",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      type: "GIVE",
      sources: { command: GIVE_COMMAND },
    });
  });

  it("求助内容发布时请求体包含显式类型", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    fetchSpy.mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel({ postType: "REQUEST", pieceNumber: 1 });

    fireEvent.change(screen.getByLabelText("拼图口令"), {
      target: { value: REQUEST_COMMAND },
    });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.type).toBe("REQUEST");
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
});
