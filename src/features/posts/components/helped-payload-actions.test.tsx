import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostSources } from "@/features/posts/domain/types";
import { HelpedPayloadActions } from "./helped-payload-actions";

const URL =
  "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html?targetUrl=https%3A%2F%2Fwx.10086.cn%2Fhlwyxhdhub%2Fact-wedrecharge%2F1024101716%3FgiveCard%3Dabc";

describe("HelpedPayloadActions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("复制口令后唤起中国移动 APP", async () => {
    const writeText = vi.fn(async () => undefined);
    const launchApp = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <HelpedPayloadActions
        payloads={{ command: "￥助力口令￥" }}
        launchApp={launchApp}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "使用口令" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("￥助力口令￥"));
    expect(launchApp).toHaveBeenCalledWith("leadeon://");
  });

  it("复制失败时展示口令和重试按钮且不唤起 APP", async () => {
    const launchApp = vi.fn();
    vi.stubGlobal(
      "navigator",
      { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } },
    );
    render(
      <HelpedPayloadActions
        payloads={{ command: "￥助力口令￥" }}
        launchApp={launchApp}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "使用口令" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("复制失败"));
    expect(screen.getByText("￥助力口令￥")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试复制" })).toBeInTheDocument();
    expect(launchApp).not.toHaveBeenCalled();
  });

  it("链接再次经过白名单校验后导航", async () => {
    const navigate = vi.fn();
    render(
      <HelpedPayloadActions payloads={{ url: URL }} navigate={navigate} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开链接" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(URL));
  });

  it("双来源切换不调用助力接口", async () => {
    const fetchSpy = vi.fn();
    const payloads: PostSources = { command: "￥口令￥", url: URL };
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
    render(<HelpedPayloadActions payloads={payloads} launchApp={vi.fn()} navigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "使用口令" }));
    await waitFor(() => expect(screen.getByText("口令已复制")).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
