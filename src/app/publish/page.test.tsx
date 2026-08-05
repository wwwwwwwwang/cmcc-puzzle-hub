import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/posts/components/publish-panel", () => ({
  PublishPanel: ({
    postType,
    discount,
    pieceNumber,
  }: {
    postType: "GIVE" | "REQUEST" | null;
    discount: number;
    pieceNumber: number | null;
  }) => (
    <output aria-label="发布面板状态">
      {`${postType ?? "none"}:${discount}:${pieceNumber ?? "none"}`}
    </output>
  ),
}));

import PublishPage from "./page";

describe("PublishPage", () => {
  afterEach(cleanup);

  it("默认不选择类型并禁用拼图步骤", () => {
    render(<PublishPage />);

    expect(screen.getByRole("button", { name: "赠送拼图" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "求助拼图" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("tab", { name: "8折" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getAllByRole("radio", { name: /8折\d号拼图/ })).toHaveLength(9);
    expect(screen.getByRole("radio", { name: "8折1号拼图" })).toBeDisabled();
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent(
      "none:80:none",
    );
  });

  it("选择类型后启用拼图并把类型传给发布面板", () => {
    render(<PublishPage />);

    fireEvent.click(screen.getByRole("button", { name: "求助拼图" }));
    expect(screen.getByRole("button", { name: "求助拼图" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("tab", { name: "8折" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    fireEvent.click(screen.getByRole("radio", { name: "8折1号拼图" }));
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent(
      "REQUEST:80:1",
    );
  });

  it("切换折扣时清空旧拼图选择", () => {
    render(<PublishPage />);
    fireEvent.click(screen.getByRole("button", { name: "赠送拼图" }));
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent(
      "GIVE:80:6",
    );

    fireEvent.click(screen.getByRole("tab", { name: "95折" }));

    expect(screen.getAllByRole("radio", { name: /95折\d号拼图/ })).toHaveLength(4);
    expect(screen.getByLabelText("发布面板状态")).toHaveTextContent(
      "GIVE:95:none",
    );
  });
});
