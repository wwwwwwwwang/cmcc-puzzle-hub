import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../admin-actions", () => ({
  approveUser: vi.fn(async () => ({})),
  rejectUser: vi.fn(async () => ({})),
}));

import { ReviewButtons } from "./review-buttons";

describe("ReviewButtons", () => {
  it("将审核操作分组并允许窄屏换行", () => {
    render(<ReviewButtons targetId="user-1" />);

    const group = screen.getByRole("group", { name: "审核操作" });
    expect(group).toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "通过" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
  });
});
