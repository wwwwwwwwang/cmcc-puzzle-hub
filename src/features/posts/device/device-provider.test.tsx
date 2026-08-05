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
      <span data-testid="public-id-status">{identity.publicIdStatus}</span>
      <span data-testid="public-id">{identity.publicId ?? "none"}</span>
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
    vi.unstubAllGlobals();
  });

  it("挂载后加载身份并进入 ready", async () => {
    const loader = vi.fn(async () => "device-one");
    const publicIdLoader = vi.fn(async () => "U-0123456789ABCDEF");

    render(
      <DeviceIdentityProvider loader={loader} publicIdLoader={publicIdLoader}>
        <Consumer />
      </DeviceIdentityProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("visitor-id")).toHaveTextContent("device-one");
    await waitFor(() =>
      expect(screen.getByTestId("public-id-status")).toHaveTextContent("ready"),
    );
    expect(screen.getByTestId("public-id")).toHaveTextContent(
      "U-0123456789ABCDEF",
    );
    expect(publicIdLoader).toHaveBeenCalledWith("device-one");
  });

  it("React Strict Mode 重放 effect 时只调用一次 loader", async () => {
    const loader = vi.fn(async () => "strict-device");
    const publicIdLoader = vi.fn(async () => "U-0123456789ABCDEF");

    render(
      <StrictMode>
        <DeviceIdentityProvider loader={loader} publicIdLoader={publicIdLoader}>
          <Consumer />
        </DeviceIdentityProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(loader).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(publicIdLoader).toHaveBeenCalledTimes(1));
  });

  it("加载失败进入 error，retry 后重新 loading 并再次调用", async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce("device-two");
    const publicIdLoader = vi.fn(async () => "U-0123456789ABCDEF");

    render(
      <DeviceIdentityProvider loader={loader} publicIdLoader={publicIdLoader}>
        <Consumer />
      </DeviceIdentityProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("公开 ID 加载失败不影响设备身份 ready", async () => {
    const loader = vi.fn(async () => "device-three");
    const publicIdLoader = vi.fn(async () => {
      throw new Error("identity api unavailable");
    });

    render(
      <DeviceIdentityProvider loader={loader} publicIdLoader={publicIdLoader}>
        <Consumer />
      </DeviceIdentityProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    await waitFor(() =>
      expect(screen.getByTestId("public-id-status")).toHaveTextContent("error"),
    );
    expect(screen.getByTestId("visitor-id")).toHaveTextContent("device-three");
    expect(screen.getByTestId("public-id")).toHaveTextContent("none");
  });

  it("默认公开 ID loader 请求身份接口", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ publicId: "U-0123456789ABCDEF" })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <DeviceIdentityProvider loader={async () => "device-four"}>
        <Consumer />
      </DeviceIdentityProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("public-id")).toHaveTextContent(
        "U-0123456789ABCDEF",
      ),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/identity",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ visitorId: "device-four" }),
      }),
    );
  });

  it("Provider 外调用 useDeviceIdentity 时抛出清晰错误", () => {
    expect(() => render(<Consumer />)).toThrow(/DeviceIdentityProvider/i);
  });
});
