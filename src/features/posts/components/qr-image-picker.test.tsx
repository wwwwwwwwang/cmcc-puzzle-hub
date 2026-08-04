import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GIVE_URL } from "../../../../tests/fixtures/cmcc-samples";
import { QrImagePicker } from "./qr-image-picker";

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText("选择二维码图片"), {
    target: { files: [file] },
  });
}

describe("QrImagePicker", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("使用隐藏图片输入并只把文件交给本地解码函数", async () => {
    const decodeImage = vi.fn(async () => GIVE_URL);
    const onDecoded = vi.fn();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<QrImagePicker decodeImage={decodeImage} onDecoded={onDecoded} />);
    const input = screen.getByLabelText("选择二维码图片");
    const file = new File(["png"], "puzzle.png", { type: "image/png" });

    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveClass("sr-only");
    selectFile(file);

    await waitFor(() => expect(onDecoded).toHaveBeenCalledWith(GIVE_URL));
    expect(decodeImage).toHaveBeenCalledWith(file);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      new File(["text"], "payload.txt", { type: "text/plain" }),
      "请选择图片文件",
    ],
    [
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
        type: "image/png",
      }),
      "图片不能超过 10MB",
    ],
  ])("拒绝非法文件并显示明确错误", async (file, message) => {
    const decodeImage = vi.fn(async () => GIVE_URL);
    render(<QrImagePicker decodeImage={decodeImage} onDecoded={vi.fn()} />);

    selectFile(file);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(decodeImage).not.toHaveBeenCalled();
  });

  it.each([
    [null, "图片中未识别到二维码"],
    ["https://example.com/not-allowed", "二维码不是有效的中国移动拼图链接"],
  ])("拒绝无二维码或非白名单内容", async (decoded, message) => {
    const decodeImage = vi.fn(async () => decoded);
    const onDecoded = vi.fn();
    render(<QrImagePicker decodeImage={decodeImage} onDecoded={onDecoded} />);

    selectFile(new File(["png"], "puzzle.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onDecoded).not.toHaveBeenCalled();
  });

  it("禁用时文件输入和选择按钮均不可用", () => {
    render(<QrImagePicker disabled onDecoded={vi.fn()} />);

    expect(screen.getByLabelText("选择二维码图片")).toBeDisabled();
    expect(screen.getByRole("button", { name: "选择二维码图片" })).toBeDisabled();
  });
});
