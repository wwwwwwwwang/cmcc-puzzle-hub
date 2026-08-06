import { FileText } from "lucide-react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("展示场景图标、标题和说明", () => {
    render(
      <EmptyState
        icon={FileText}
        title="还没有发布过拼图"
        description="发布后可以在这里查看状态。"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "还没有发布过拼图",
    );
    expect(
      screen.getByText("发布后可以在这里查看状态。"),
    ).toBeInTheDocument();
  });
});
