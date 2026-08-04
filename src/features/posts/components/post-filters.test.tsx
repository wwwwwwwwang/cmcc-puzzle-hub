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

  it("将 type 和 discount 写入 URLSearchParams 并清除旧游标", () => {
    currentSearch = "cursor=opaque&type=GIVE";
    render(<PostFilters />);

    fireEvent.change(screen.getByLabelText("类型筛选"), { target: { value: "REQUEST" } });
    expect(replace).toHaveBeenCalledWith("/?type=REQUEST");

    fireEvent.change(screen.getByLabelText("折扣筛选"), { target: { value: "80" } });
    expect(replace).toHaveBeenCalledWith("/?type=GIVE&discount=80");
  });
});
