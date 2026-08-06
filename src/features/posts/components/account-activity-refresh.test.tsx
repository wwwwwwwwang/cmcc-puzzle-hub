import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { AccountActivityRefresh } from "./account-activity-refresh";

function activityResponse(
  pendingConfirmationCount: number,
  pendingHelpCount: number,
  version = "v1",
) {
  return new Response(
    JSON.stringify({ pendingConfirmationCount, pendingHelpCount, version }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("AccountActivityRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("存在待处理时每 30 秒检查一次", async () => {
    const fetchSpy = vi.fn(async () => activityResponse(1, 0));
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AccountActivityRefresh
        pendingKind="confirmation"
        initialPendingCount={1}
      />,
    );

    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("没有待处理时不启动定时检查但保留手动刷新", async () => {
    const fetchSpy = vi.fn(async () => activityResponse(0, 0));
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AccountActivityRefresh pendingKind="help" initialPendingCount={0} />,
    );

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("页面隐藏时暂停，重新可见时立即检查", async () => {
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const fetchSpy = vi.fn(async () => activityResponse(1, 0));
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AccountActivityRefresh
        pendingKind="confirmation"
        initialPendingCount={1}
      />,
    );

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchSpy).not.toHaveBeenCalled();

    hidden = false;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("焦点检查与手动刷新合并重复请求", async () => {
    let finish!: (response: Response) => void;
    const fetchSpy = vi.fn(
      () => new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AccountActivityRefresh
        pendingKind="confirmation"
        initialPendingCount={1}
      />,
    );

    act(() => window.dispatchEvent(new Event("focus")));
    fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finish(activityResponse(1, 0));
    await act(async () => Promise.resolve());
  });

  it("待处理数量或版本变化时刷新当前路由", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(activityResponse(0, 0, "v2"));
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AccountActivityRefresh
        pendingKind="confirmation"
        initialPendingCount={1}
      />,
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("请求失败显示非阻塞提示且下一轮可重试", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(activityResponse(1, 0));
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AccountActivityRefresh
        pendingKind="confirmation"
        initialPendingCount={1}
      />,
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("刷新失败");
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
