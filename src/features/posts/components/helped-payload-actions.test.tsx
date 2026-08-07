import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GIVE_URL } from "../../../../tests/fixtures/cmcc-samples";
import { HelpedPayloadActions } from "./helped-payload-actions";

describe("HelpedPayloadActions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("再次白名单校验二维码链接后导航", async () => {
    const navigate = vi.fn();
    render(<HelpedPayloadActions payloads={{ url: GIVE_URL }} navigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: "打开二维码" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(GIVE_URL));
  });

  it("缺少二维码链接时显示不可用错误", async () => {
    const navigate = vi.fn();
    render(<HelpedPayloadActions payloads={{}} navigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: "打开二维码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("链接无效");
    expect(navigate).not.toHaveBeenCalled();
  });
});
