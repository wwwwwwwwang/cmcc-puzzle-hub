"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDeviceIdentity } from "@/features/posts/device/device-provider";
import { DomainError } from "@/features/posts/domain/errors";
import { parseSource } from "@/features/posts/domain/parse-source";
import type { CreatePostInput } from "@/features/posts/domain/schemas";
import type { Discount, ParsedSource } from "@/features/posts/domain/types";

import { QrImagePicker, type DecodeImage } from "./qr-image-picker";

type PublishPanelProps = {
  discount: Discount;
  pieceNumber: number | null;
  decodeImage?: DecodeImage;
};

const discountLabel = { 95: "95折", 90: "9折", 80: "8折" } as const;
const typeLabel = { GIVE: "赠送", REQUEST: "求助" } as const;

const apiErrorMessage: Record<string, string> = {
  INVALID_INPUT: "发布信息有误，请检查后重试",
  INVALID_CONTENT: "内容无法识别，请检查后重试",
  SELECTION_MISMATCH: "口令拼图与当前选择不一致",
  DUPLICATE_POST: "这条内容已经发布过了",
  RATE_LIMITED: "发布过于频繁，请稍后再试",
  SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后重试",
};

export function PublishPanel({
  discount,
  pieceNumber,
  decodeImage,
}: PublishPanelProps) {
  const router = useRouter();
  const identity = useDeviceIdentity();
  const [command, setCommand] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<"COMMAND" | "URL">("COMMAND");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selection = useMemo(
    () => (pieceNumber === null ? null : { discount, pieceNumber }),
    [discount, pieceNumber],
  );
  const sourceValue = sourceKind === "COMMAND" ? command : qrUrl;

  const preview = useMemo(() => {
    if (!selection || !sourceValue.trim()) {
      return { parsed: null, error: null };
    }

    try {
      return {
        parsed: parseSource({ kind: sourceKind, value: sourceValue }, selection),
        error: null,
      };
    } catch (error) {
      return {
        parsed: null,
        error:
          error instanceof DomainError
            ? error.message
            : "内容无法识别，请检查后重试",
      };
    }
  }, [selection, sourceKind, sourceValue]);

  const canSubmit = Boolean(
    selection &&
      preview.parsed &&
      identity.status === "ready" &&
      identity.visitorId !== null &&
      !submitting,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selection ||
      !preview.parsed ||
      identity.status !== "ready" ||
      identity.visitorId === null ||
      submittingRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const input: CreatePostInput = {
      selection,
      source: { kind: sourceKind, value: sourceValue },
      visitorId: identity.visitorId,
    };

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const code = await readErrorCode(response);
        setSubmitError(apiErrorMessage[code] ?? "发布失败，请稍后重试");
        return;
      }

      setCommand("");
      setQrUrl("");
      router.push("/");
    } catch {
      setSubmitError("网络连接失败，请检查网络后重试");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleDecoded(url: string) {
    setQrUrl(url);
    setSourceKind("URL");
    setSubmitError(null);
  }

  const parsed = preview.parsed as ParsedSource | null;

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="post-command" className="text-sm font-medium text-slate-800">
          拼图口令
        </label>
        <Textarea
          id="post-command"
          aria-label="拼图口令"
          placeholder={selection ? "粘贴中国移动拼图口令" : "请先选择拼图"}
          value={command}
          disabled={!selection || submitting}
          onChange={(event) => {
            setCommand(event.target.value);
            setSourceKind("COMMAND");
            setSubmitError(null);
          }}
        />
      </div>

      <div className="flex items-start justify-between gap-3">
        <QrImagePicker
          disabled={!selection || submitting}
          decodeImage={decodeImage}
          onDecoded={handleDecoded}
        />
        <span className="pt-2 text-xs text-slate-500">图片只在本机识别</span>
      </div>

      {parsed && selection ? (
        <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
          {discountLabel[selection.discount]}{selection.pieceNumber}号·{typeLabel[parsed.type]}
        </p>
      ) : null}
      {preview.error ? (
        <p role="alert" className="text-sm text-red-600">
          {preview.error}
        </p>
      ) : null}
      {submitError ? (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      ) : null}
      {identity.status === "error" ? (
        <div className="flex items-center justify-between gap-3 text-sm text-red-600">
          <span>设备身份加载失败</span>
          <Button type="button" variant="outline" size="sm" onClick={identity.retry}>
            重试
          </Button>
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
        {identity.status === "loading"
          ? "正在准备身份…"
          : submitting
            ? "正在发布…"
            : "发布"}
      </Button>
    </form>
  );
}

async function readErrorCode(response: Response) {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : "";
  } catch {
    return "";
  }
}
