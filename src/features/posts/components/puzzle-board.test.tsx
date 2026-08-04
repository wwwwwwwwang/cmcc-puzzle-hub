import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Discount } from "../domain/types";
import { PuzzleBoard } from "./puzzle-board";

function Harness() {
  const [discount, setDiscount] = useState<Discount>(80);
  const [value, setValue] = useState<number | null>(null);

  function changeDiscount(nextDiscount: Discount) {
    setDiscount(nextDiscount);
    setValue(null);
  }

  return (
    <>
      <button onClick={() => changeDiscount(95)}>95折</button>
      <button onClick={() => changeDiscount(90)}>9折</button>
      <PuzzleBoard discount={discount} value={value} onChange={setValue} />
    </>
  );
}

describe("PuzzleBoard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("默认 8 折显示 9 块且每块保持正方形", () => {
    render(<Harness />);
    const pieces = screen.getAllByRole("radio", { name: /8折\d号拼图/ });
    expect(pieces).toHaveLength(9);
    expect(pieces.every((piece) => piece.className.includes("aspect-square"))).toBe(
      true,
    );
  });

  it("单选 6 号并使用科技蓝选中态", () => {
    render(<Harness />);
    const sixth = screen.getByRole("radio", { name: "8折6号拼图" });
    fireEvent.click(sixth);
    expect(sixth).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
    expect(sixth.className).toMatch(/blue|primary/);
  });

  it("切换 95 折显示 4 块并清除旧选择", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    fireEvent.click(screen.getByRole("button", { name: "95折" }));

    expect(screen.getAllByRole("radio", { name: /95折\d号拼图/ })).toHaveLength(4);
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
  });

  it("切换 9 折显示 6 块", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "9折" }));
    expect(screen.getAllByRole("radio", { name: /9折\d号拼图/ })).toHaveLength(6);
  });

  it("reduced motion 时不配置位移动画", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    render(<Harness />);
    expect(screen.getByRole("radio", { name: "8折1号拼图" })).toBeInTheDocument();
  });
});
