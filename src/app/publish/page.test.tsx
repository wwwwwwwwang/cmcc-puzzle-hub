import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/components/publish-panel", () => ({
  PublishPanel: ({ discount, pieceNumber }: { discount: number; pieceNumber: number | null }) => (
    <output aria-label="发布面板状态">{`${discount}:${pieceNumber ?? "none"}`}</output>
  ),
}));

import PublishPage from "./page";

describe("PublishPage", () => {
  afterEach(cleanup);

  it("默认使用 8 折并组合 PuzzleBoard 与 PublishPanel", () => {
    render(<PublishPage />);

    expect(screen.getAllByRole("radio", { name: /8折\d号拼图/ })).toHaveLength(9);
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent("80:none");
  });

  it("切换折扣时清空旧拼图选择", () => {
    render(<PublishPage />);
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent("80:6");

    fireEvent.click(screen.getByRole("tab", { name: "95折" }));

    expect(screen.getAllByRole("radio", { name: /95折\d号拼图/ })).toHaveLength(4);
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent("95:none");
  });
});
