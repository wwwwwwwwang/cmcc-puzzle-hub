"use client";

import { ExternalLink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAuthSession } from "@/features/auth/auth-session";
import { parseUrl } from "@/features/posts/domain/parse-url";
import type { HallPostDto, PostSources } from "@/features/posts/domain/types";

type ClaimDrawerProps = {
  post: HallPostDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClaimed: (postId: string) => void;
  navigate?: (url: string) => void;
};

type ClaimSuccess = {
  payloads: { url: string };
  idempotent: boolean;
};

const errorMessages: Record<string, string> = {
  EXPIRED: "这条内容已过期",
  INSUFFICIENT_CREDITS: "信用点不足，发布赠送被领取可获得信用",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后重试",
  HELP_RETRY_FORBIDDEN: "你已助力过该求助，不能重复参与",
};

export function ClaimDrawer({
  post,
  open,
  onOpenChange,
  onClaimed,
  navigate = defaultNavigate,
}: ClaimDrawerProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedPayloads, setClaimedPayloads] = useState<PostSources | null>(null);
  const [helpSubmitted, setHelpSubmitted] = useState(false);
  const submittingRef = useRef(false);
  const actionNoun = post.type === "GIVE" ? "领取" : "助力";

  function executeUrl(payloads: PostSources) {
    setError(null);
    if (!payloads.url) {
      setError(`${actionNoun}链接不可用，请稍后重试`);
      return;
    }

    try {
      parseUrl(payloads.url);
      navigate(payloads.url);
    } catch {
      setError(`${actionNoun}链接无效，请稍后重试`);
    }
  }

  async function handleClaim() {
    if (claimedPayloads) {
      executeUrl(claimedPayloads);
      return;
    }

    if (!isAuthenticated) {
      router.push(`/login?redirect=/`);
      return;
    }

    if (submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const endpoint = post.type === "GIVE" ? "claim" : "help";
      const response = await fetch(`/api/posts/${post.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.status === 401) {
        router.push(`/login?redirect=/`);
        return;
      }

      if (!response.ok) {
        const code = await readErrorCode(response);
        if (code === "ALREADY_CLAIMED" || code === "ALREADY_HELPED") {
          onClaimed(post.id);
          onOpenChange(false);
          return;
        }
        setError(
          code === "SELF_CLAIM_FORBIDDEN" || code === "SELF_HELP_FORBIDDEN"
            ? `不能${actionNoun}自己发布的内容`
            : (errorMessages[code] ?? `${actionNoun}失败，请稍后重试`),
        );
        return;
      }

      const result = readClaimSuccess(await response.json());
      if (!result) {
        setError(`${actionNoun}结果无效，请稍后重试`);
        return;
      }

      setClaimedPayloads(result.payloads);
      if (post.type === "REQUEST") setHelpSubmitted(true);
      onClaimed(post.id);
      executeUrl(result.payloads);
    } catch {
      setError("网络连接失败，请检查网络后重试");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[420px] rounded-t-[20px] border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          aria-label={`关闭${actionNoun}弹窗`}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-10 flex size-[30px] items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <DrawerHeader className="text-center">
          <DrawerTitle>
            {post.type === "GIVE" ? "领取" : "助力"}{" "}
            {post.discount === 95
              ? "95折"
              : post.discount === 90
                ? "9折"
                : "8折"}{" "}
            {post.pieceNumber} 号拼图
          </DrawerTitle>
          <DrawerDescription>
            确认后将{actionNoun}并打开二维码链接
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 py-5">
          {!isAuthenticated ? (
            <p className="text-sm text-slate-500">
              {actionNoun}需要先登录,点击下方按钮将前往登录页。
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {helpSubmitted ? (
            <p role="status" className="text-sm font-medium text-emerald-700">
              助力已提交，等待对方确认
            </p>
          ) : null}
        </div>

        <DrawerFooter>
          <Button
            type="button"
            className="h-12 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
            disabled={submitting}
            onClick={() => void handleClaim()}
          >
            <ExternalLink data-icon="inline-start" />
            {submitting
              ? `正在${actionNoun}…`
              : claimedPayloads
                ? "打开二维码"
                : `使用链接${actionNoun}`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function readClaimSuccess(value: unknown): ClaimSuccess | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ClaimSuccess>;
  const payloads = candidate.payloads;
  if (
    !payloads ||
    typeof payloads !== "object" ||
    typeof (payloads as { url?: unknown }).url !== "string" ||
    typeof candidate.idempotent !== "boolean"
  ) {
    return null;
  }

  return {
    payloads: { url: (payloads as { url: string }).url },
    idempotent: candidate.idempotent,
  };
}

async function readErrorCode(response: Response) {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : "";
  } catch {
    return "";
  }
}

function defaultNavigate(url: string) {
  window.location.href = url;
}
