"use client";

import { CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  INVALID_CONTENT: "内容无法识别，请检查后重试",
  SELECTION_MISMATCH: "口令与二维码对应的拼图不一致",
  TYPE_MISMATCH: "选择的发布类型与内容不一致，请检查后重试",
  DUPLICATE_POST: "这条内容已经发布过了",
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
  const { isAuthenticated } = useAuthSession();
  const [command, setCommand] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [activeSource, setActiveSource] = useState<"COMMAND" | "URL">("COMMAND");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selection = useMemo(
    () => (pieceNumber === null ? null : { discount, pieceNumber }),
    [discount, pieceNumber],
  );
  const sources = useMemo(
    () => ({
      ...(command.trim() ? { command } : {}),
      ...(qrUrl.trim() ? { url: qrUrl } : {}),
    }),
    [command, qrUrl],
  );
  const preview = useMemo(() => {
    if (!selection || Object.keys(sources).length === 0) {
      return { parsed: null, error: null };
    }
    try {
      const parsed = parseSources(sources, selection);
      if (postType) assertPostTypeMatches(parsed.type, postType);
      return { parsed, error: null };
    } catch (error) {
      return {
        parsed: null,
        error: error instanceof DomainError ? error.message : "内容无法识别，请检查后重试",
      };
    }
  }, [postType, selection, sources]);
  const canSubmit = Boolean(
    postType && selection && preview.parsed && isAuthenticated && !submitting,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !postType ||
      !selection ||
      !preview.parsed ||
      !isAuthenticated ||
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
      sources: { command: command.trim() || undefined, url: qrUrl.trim() || undefined },
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

  const sourceSummary = [command.trim() ? "口令" : null, qrUrl ? "链接" : null]
    .filter(Boolean)
    .join(" + ");

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {postType === null ? (
        <p className="text-sm text-slate-500">请先选择发布类型</p>
      ) : selection === null ? (
        <p className="text-sm text-slate-500">请先选择拼图</p>
      ) : null}
      <Tabs
        value={activeSource}
        onValueChange={(value) => setActiveSource(value as "COMMAND" | "URL")}
        className="gap-3"
      >
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="COMMAND">
            粘贴口令
            {command.trim() && !preview.error ? <CheckCircle2 aria-hidden="true" className="text-emerald-600" /> : null}
          </TabsTrigger>
          <TabsTrigger value="URL">
            上传二维码
            {qrUrl && !preview.error ? <CheckCircle2 aria-hidden="true" className="text-emerald-600" /> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="COMMAND" className="space-y-2">
          <label htmlFor="post-command" className="text-sm font-medium text-slate-800">中国移动拼图口令</label>
          <Textarea
            id="post-command"
            aria-label="拼图口令"
            placeholder={
              postType === null
                ? "请先选择发布类型"
                : selection
                  ? "粘贴中国移动拼图口令"
                  : "请先选择拼图"
            }
            value={command}
            disabled={!postType || !selection || submitting}
            onChange={(event) => { setCommand(event.target.value); setSubmitError(null); }}
          />
          {command ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setCommand("")} disabled={submitting}>
              <Trash2 aria-hidden="true" />清除口令
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="URL" className="space-y-3">
          <QrImagePicker
            disabled={!postType || !selection || submitting}
            decodeImage={decodeImage}
            onDecoded={(url) => { setQrUrl(url); setSubmitError(null); }}
          />
          <p className="text-xs text-slate-500">图片只在本机识别，不会上传</p>
          {qrUrl ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>二维码链接已识别</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setQrUrl("")} disabled={submitting}>
                <Trash2 aria-hidden="true" />清除链接
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {preview.parsed && selection ? (
        <div className="space-y-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
          <p>{discountLabel[selection.discount]}{selection.pieceNumber}号·{typeLabel[preview.parsed.type]}</p>
          <p>将保存：{sourceSummary}</p>
        </div>
      ) : null}
      {preview.error ? <p role="alert" className="text-sm text-red-600">{preview.error}</p> : null}
      {submitError ? <p role="alert" className="text-sm text-red-600">{submitError}</p> : null}
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
