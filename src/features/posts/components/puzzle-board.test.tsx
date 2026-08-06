import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, forwardRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Discount } from "../domain/types";
import { PuzzleBoard } from "./puzzle-board";

const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { value: false } }));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => reducedMotion.value,
  motion: {
    button: forwardRef<HTMLButtonElement, Record<string, unknown>>(
      function MotionButton(
        { animate, whileTap, transition, ...props },
        ref,
      ) {
        return createElement("button", {
          ...props,
          ref,
          "data-motion-animate": animate && JSON.stringify(animate),
          "data-motion-tap": whileTap && JSON.stringify(whileTap),
          "data-motion-transition": transition && JSON.stringify(transition),
        });
      },
    ),
  },
}));

function Harness() {
  const [discount, setDiscount] = useState<Discount>(80);
  const [value, setValue] = useState<number | null>(null);

  return (
    <>
      <button onClick={() => setDiscount(95)}>95折</button>
      <button onClick={() => setDiscount(90)}>9折</button>
      <PuzzleBoard discount={discount} value={value} onChange={setValue} />
    </>
  );
}

describe("PuzzleBoard", () => {
  afterEach(() => {
    cleanup();
    reducedMotion.value = false;
  });

  it("默认 8 折显示 9 块且每块保持正方形", () => {
    render(<Harness />);
    const pieces = screen.getAllByRole("radio", { name: /8折\d号拼图/ });
    expect(pieces).toHaveLength(9);
    expect(pieces.every((piece) => piece.className.includes("aspect-square"))).toBe(
      true,
    );
  });

  it("禁用时鼠标和键盘都不能选择拼图", () => {
    const onChange = vi.fn();
    render(
      <PuzzleBoard
        discount={80}
        value={null}
        onChange={onChange}
        disabled
      />,
    );

    const first = screen.getByRole("radio", { name: "8折1号拼图" });
    expect(first).toBeDisabled();
    expect(first).toHaveAttribute("tabindex", "-1");
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("radio", { name: "8折2号拼图" }));
    fireEvent.click(screen.getByRole("button", { name: "95折" }));

    expect(screen.getAllByRole("radio", { name: /95折\d号拼图/ })).toHaveLength(4);
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
  });

  it("切换 9 折显示 6 块", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "9折" }));
    expect(screen.getAllByRole("radio", { name: /9折\d号拼图/ })).toHaveLength(6);
    expect(screen.getByRole("radiogroup")).toHaveStyle({
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    });
  });

  it("使用 roving tabindex 且方向键循环移动选择和焦点", () => {
    render(<Harness />);
    const first = screen.getByRole("radio", { name: "8折1号拼图" });
    const second = screen.getByRole("radio", { name: "8折2号拼图" });
    const ninth = screen.getByRole("radio", { name: "8折9号拼图" });

    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(ninth).toHaveFocus();
    expect(ninth).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(ninth, { key: "ArrowRight" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-checked", "true");
  });

  it("Home 和 End 移动到首尾拼图", () => {
    render(<Harness />);
    const first = screen.getByRole("radio", { name: "8折1号拼图" });
    const fourth = screen.getByRole("radio", { name: "8折4号拼图" });
    const ninth = screen.getByRole("radio", { name: "8折9号拼图" });

    fourth.focus();
    fireEvent.keyDown(fourth, { key: "End" });
    expect(ninth).toHaveFocus();
    expect(ninth).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(ninth, { key: "Home" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-checked", "true");
  });

  it("reduced motion 时不向按钮配置动画", () => {
    reducedMotion.value = true;

    render(<Harness />);
    const first = screen.getByRole("radio", { name: "8折1号拼图" });

    expect(first).not.toHaveAttribute("data-motion-animate");
    expect(first).not.toHaveAttribute("data-motion-tap");
    expect(first).not.toHaveAttribute("data-motion-transition");
  });
});
