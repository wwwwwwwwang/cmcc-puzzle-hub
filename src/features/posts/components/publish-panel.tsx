"use client";

import { CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthSession } from "@/features/auth/auth-session";
import { DomainError } from "@/features/posts/domain/errors";
import {
  assertPostTypeMatches,
  parseSources,
} from "@/features/posts/domain/parse-source";
import type { CreatePostInput } from "@/features/posts/domain/schemas";
import type { Discount, PostType } from "@/features/posts/domain/types";

import { QrImagePicker, type DecodeImage } from "./qr-image-picker";

type PublishPanelProps = {
  postType: PostType | null;
  discount: Discount;
  pieceNumber: number | null;
  decodeImage?: DecodeImage;
};

const discountLabel = { 95: "95折", 90: "9折", 80: "8折" } as const;
const typeLabel = { GIVE: "赠送", REQUEST: "求助" } as const;
const apiErrorMessage: Record<string, string> = {
  INVALID_INPUT: "发布信息有误，请检查后重试",
  INVALID_CONTENT: "二维码内容无法识别，请检查后重试",
  SELECTION_MISMATCH: "二维码与当前拼图选择不一致",
  TYPE_MISMATCH: "选择的发布类型与二维码内容不一致，请检查后重试",
  DUPLICATE_POST: "该二维码对应的拼图已经发布过了",
  RATE_LIMITED: "发布过于频繁，请稍后再试",
  SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后重试",
};

export function PublishPanel({
  postType,
  discount,
  pieceNumber,
  decodeImage,
}: PublishPanelProps) {
  const router = useRouter();
  const { isAuthenticated, isApproved } = useAuthSession();
  const [qrUrl, setQrUrl] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selection = useMemo(
    () => (pieceNumber === null ? null : { discount, pieceNumber }),
    [discount, pieceNumber],
  );
  const sources = useMemo(
    () => (qrUrl.trim() ? { url: qrUrl } : {}),
    [qrUrl],
  );
  const preview = useMemo(() => {
    if (!selection || !sources.url) {
      return { parsed: null, error: null };
    }
    try {
      const parsed = parseSources(sources, selection);
      if (postType) assertPostTypeMatches(parsed.type, postType);
      return { parsed, error: null };
    } catch (error) {
      return {
        parsed: null,
        error:
          error instanceof DomainError
            ? error.message
            : "二维码内容无法识别，请检查后重试",
      };
    }
  }, [postType, selection, sources]);
  const canSubmit = Boolean(
    postType &&
    selection &&
    sources.url &&
    preview.parsed &&
    isAuthenticated &&
    isApproved &&
    !submitting,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !postType ||
      !selection ||
      !sources.url ||
      !preview.parsed ||
      !isAuthenticated ||
      !isApproved ||
      submittingRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const input: CreatePostInput = {
      type: postType,
      selection,
      sources: { url: sources.url },
    };

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.status === 401) {
        router.push("/login?redirect=/publish");
        return;
      }
      if (!response.ok) {
        const code = await readErrorCode(response);
        setSubmitError(apiErrorMessage[code] ?? "发布失败，请稍后重试");
        return;
      }
      setQrUrl("");
      router.push("/");
    } catch {
      setSubmitError("网络连接失败，请检查网络后重试");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {postType === null ? (
        <p className="text-sm text-slate-500">请先选择发布类型</p>
      ) : selection === null ? (
        <p className="text-sm text-slate-500">请先选择拼图</p>
      ) : null}

      <div className="space-y-3">
        <QrImagePicker
          disabled={!postType || !selection || !isApproved || submitting}
          decodeImage={decodeImage}
          onDecoded={(url) => {
            setQrUrl(url);
            setSubmitError(null);
          }}
        />
        <p className="text-xs text-slate-500">图片只在本机识别，不会上传</p>
        {qrUrl ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              二维码链接已识别
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQrUrl("")}
              disabled={submitting}
            >
              <Trash2 aria-hidden="true" />
              清除链接
            </Button>
          </div>
        ) : null}
      </div>

      {preview.parsed && selection ? (
        <div className="space-y-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
          <p>
            {discountLabel[selection.discount]}
            {selection.pieceNumber}号·{typeLabel[preview.parsed.type]}
          </p>
          <p>将保存：二维码链接</p>
        </div>
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
      {!isAuthenticated ? (
        <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
          <p>发布拼图需要先登录账号。</p>
          <Link
            href="/login?redirect=/publish"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            去登录 / 注册
          </Link>
        </div>
      ) : !isApproved ? (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
          账号待审核，当前仅可浏览；审核通过后才能发布。
        </p>
      ) : (
        <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
          {submitting ? "正在发布…" : "发布"}
        </Button>
      )}
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
