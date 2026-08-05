import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HallPuzzleBoard } from "./hall-puzzle-board";

describe("HallPuzzleBoard", () => {
  afterEach(cleanup);

  it.each([
    [95, 4, "repeat(2, minmax(0, 1fr))"],
    [90, 6, "repeat(2, minmax(0, 1fr))"],
    [80, 9, "repeat(3, minmax(0, 1fr))"],
  ] as const)("%s 折渲染 %s 块", (discount, count, columns) => {
    const onChange = vi.fn();
    render(
      <HallPuzzleBoard discount={discount} value={null} onChange={onChange} />,
    );

    const board = screen.getByRole("radiogroup");
    expect(screen.getAllByRole("radio")).toHaveLength(count);
    expect(board).toHaveStyle({ gridTemplateColumns: columns });
  });

  it("点击同一编号时取消选择", () => {
    const onChange = vi.fn();
    const view = render(
      <HallPuzzleBoard discount={80} value={null} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(onChange).toHaveBeenLastCalledWith(6);

    view.rerender(
      <HallPuzzleBoard discount={80} value={6} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("方向键循环移动选择和焦点", () => {
    const onChange = vi.fn();
    render(
      <HallPuzzleBoard discount={80} value={null} onChange={onChange} />,
    );
    const first = screen.getByRole("radio", { name: "8折1号拼图" });
    const ninth = screen.getByRole("radio", { name: "8折9号拼图" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(ninth).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith(9);
  });
});
