import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmationCountdown } from "./confirmation-countdown";

describe("ConfirmationCountdown", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("每秒更新剩余时分秒", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T00:00:00.000Z"));
    render(
      <ConfirmationCountdown deadline="2026-08-06T01:02:03.000Z" />,
    );

    expect(screen.getByLabelText("自动确认倒计时")).toHaveTextContent(
      "剩余 01:02:03",
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("自动确认倒计时")).toHaveTextContent(
      "剩余 01:02:02",
    );
  });

  it("到期后只提示等待系统自动确认", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T02:00:00.000Z"));
    render(
      <ConfirmationCountdown deadline="2026-08-06T01:00:00.000Z" />,
    );

    expect(screen.getByLabelText("自动确认倒计时")).toHaveTextContent(
      "等待系统自动确认",
    );
  });
});
