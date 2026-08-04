"use client";

import jsQR from "jsqr";
import { ImagePlus } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { parseUrl } from "@/features/posts/domain/parse-url";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type DecodeImage = (file: File) => Promise<string | null>;

type QrImagePickerProps = {
  onDecoded: (url: string) => void;
  decodeImage?: DecodeImage;
  disabled?: boolean;
};

export function QrImagePicker({
  onDecoded,
  decodeImage = decodeQrImage,
  disabled = false,
}: QrImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("图片不能超过 10MB");
      return;
    }

    setDecoding(true);
    try {
      const decoded = await decodeImage(file);
      if (!decoded) {
        setError("图片中未识别到二维码");
        return;
      }

      try {
        parseUrl(decoded);
      } catch {
        setError("二维码不是有效的中国移动拼图链接");
        return;
      }
      onDecoded(decoded.trim());
    } catch {
      setError("图片解析失败，请重试");
    } finally {
      setDecoding(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="选择二维码图片"
        className="sr-only"
        disabled={disabled || decoding}
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || decoding}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden="true" />
        {decoding ? "正在识别…" : "选择二维码图片"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export async function decodeQrImage(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context || canvas.width === 0 || canvas.height === 0) {
      throw new Error("Unable to read QR image");
    }

    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(imageData.data, imageData.width, imageData.height)?.data ?? null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load QR image"));
    image.src = source;
  });
}
