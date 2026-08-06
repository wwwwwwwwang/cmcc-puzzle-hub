import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountSubpageHeader } from "./account-subpage-header";

describe("AccountSubpageHeader", () => {
  it("固定返回我的账户并展示标题说明", () => {
    render(
      <AccountSubpageHeader
        title="我的帖子"
        description="管理发布记录。"
      />,
    );

    expect(
      screen.getByRole("link", { name: "返回我的账户" }),
    ).toHaveAttribute("href", "/me");
    expect(
      screen.getByRole("heading", { level: 1, name: "我的帖子" }),
    ).toBeInTheDocument();
    expect(screen.getByText("管理发布记录。")).toBeInTheDocument();
  });
});
