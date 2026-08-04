import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DeviceIdentityProvider,
  useDeviceIdentity,
} from "./device-provider";

function Consumer() {
  const identity = useDeviceIdentity();

  return (
    <div>
      <span data-testid="status">{identity.status}</span>
      <span data-testid="visitor-id">{identity.visitorId ?? "none"}</span>
      <button type="button" onClick={identity.retry}>
        retry
      </button>
    </div>
  );
}

describe("DeviceIdentityProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("挂载后加载身份并进入 ready", async () => {
    const loader = vi.fn(async () => "device-one");

    render(
      <DeviceIdentityProvider loader={loader}>
        <Consumer />
      </DeviceIdentityProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("visitor-id")).toHaveTextContent("device-one");
  });

  it("React Strict Mode 重放 effect 时只调用一次 loader", async () => {
    const loader = vi.fn(async () => "strict-device");

    render(
      <StrictMode>
        <DeviceIdentityProvider loader={loader}>
          <Consumer />
        </DeviceIdentityProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("加载失败进入 error，retry 后重新 loading 并再次调用", async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce("device-two");

    render(
      <DeviceIdentityProvider loader={loader}>
        <Consumer />
      </DeviceIdentityProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("Provider 外调用 useDeviceIdentity 时抛出清晰错误", () => {
    expect(() => render(<Consumer />)).toThrow(/DeviceIdentityProvider/i);
  });
});
