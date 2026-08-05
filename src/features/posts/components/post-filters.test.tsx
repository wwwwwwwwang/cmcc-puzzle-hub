import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostFilters } from "./post-filters";

const replace = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

describe("PostFilters", () => {
  afterEach(() => {
    cleanup();
    replace.mockReset();
    currentSearch = "";
  });

  it("将筛选写入 URL 并清除旧游标和跨折扣编号", () => {
    render(<PostFilters discount={80} type={undefined} pieceNumber={null} />);

    expect(screen.getByRole("button", { name: "8折(9块)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "全部分类" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "只看求助" }));
    expect(replace).toHaveBeenLastCalledWith("/?type=REQUEST", {
      scroll: false,
    });

    currentSearch = "discount=80&pieceNumber=6&cursor=opaque";
    cleanup();
    render(<PostFilters discount={80} type={undefined} pieceNumber={6} />);
    fireEvent.click(screen.getByRole("button", { name: "95折(4块)" }));
    expect(replace).toHaveBeenLastCalledWith("/?discount=95", {
      scroll: false,
    });

    currentSearch = "";
    cleanup();
    render(<PostFilters discount={80} type={undefined} pieceNumber={null} />);
    fireEvent.click(screen.getByRole("radio", { name: "8折6号拼图" }));
    expect(replace).toHaveBeenLastCalledWith("/?pieceNumber=6", {
      scroll: false,
    });
  });
});
