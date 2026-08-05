"use client";

import { useRef, useState } from "react";
import { Copy, ExternalLink, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useDeviceIdentity } from "@/features/posts/device/device-provider";
import { parseUrl } from "@/features/posts/domain/parse-url";
import type {
  HallPostDto,
  PayloadKind,
  PostSources,
} from "@/features/posts/domain/types";

type ClaimDrawerProps = {
  post: HallPostDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClaimed: (postId: string) => void;
  launchApp?: (url: string) => void;
  navigate?: (url: string) => void;
};

type ClaimSuccess = {
  payloads: PostSources;
  idempotent: boolean;
};

const errorMessages: Record<string, string> = {
  EXPIRED: "这条内容已过期",
  SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后重试",
};

export function ClaimDrawer({
  post,
  open,
  onOpenChange,
  onClaimed,
  launchApp = defaultLaunchApp,
  navigate = defaultNavigate,
}: ClaimDrawerProps) {
  const identity = useDeviceIdentity();
  const [submitting, setSubmitting] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<PayloadKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimedPayloads, setClaimedPayloads] = useState<PostSources | null>(null);
  const [commandReady, setCommandReady] = useState(false);
  const submittingRef = useRef(false);
  const actionNoun = post.type === "GIVE" ? "领取" : "助力";

  async function executeClaimMethod(method: PayloadKind, payloads: PostSources) {
    setError(null);

    if (method === "COMMAND") {
      if (!payloads.command) {
        setError(`${actionNoun}口令不可用，请尝试链接${actionNoun}`);
        return;
      }

      try {
        await navigator.clipboard.writeText(payloads.command);
      } catch {
        setCommandReady(false);
        setError("复制失败，请允许剪贴板权限后重试");
        return;
      }

      setCommandReady(true);
      launchApp("leadeon://");
      return;
    }

    if (!payloads.url) {
      setError(`${actionNoun}链接不可用，请尝试口令${actionNoun}`);
      return;
    }

    try {
      parseUrl(payloads.url);
    } catch {
      setError(`${actionNoun}链接无效，请稍后重试`);
      return;
    }
    navigate(payloads.url);
  }

  async function handleClaim(method: PayloadKind) {
    if (claimedPayloads) {
      await executeClaimMethod(method, claimedPayloads);
      return;
    }

    if (
      identity.status !== "ready" ||
      identity.visitorId === null ||
      submittingRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setPendingMethod(method);
    setError(null);

    try {
      const response = await fetch(`/api/posts/${post.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: identity.visitorId }),
      });

      if (!response.ok) {
        const code = await readErrorCode(response);
        if (code === "ALREADY_CLAIMED") {
          onClaimed(post.id);
          onOpenChange(false);
          return;
        }
        setError(
          code === "SELF_CLAIM_FORBIDDEN"
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
      onClaimed(post.id);
      await executeClaimMethod(method, result.payloads);
    } catch {
      setError("网络连接失败，请检查网络后重试");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setPendingMethod(null);
    }
  }

  const identityReady = identity.status === "ready" && identity.visitorId !== null;
  const hasCommand = post.availablePayloadKinds.includes("COMMAND");
  const hasUrl = post.availablePayloadKinds.includes("URL");

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
          <DrawerDescription>请选择{actionNoun}方式</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 py-5">
          <p className="text-sm text-slate-600">
            {hasCommand && hasUrl
              ? `请选择更适合你的${actionNoun}方式。`
              : `确认后将${actionNoun}并打开对应内容。`}
          </p>
          {identity.status === "loading" ? (
            <p className="text-sm text-slate-500">正在准备设备身份…</p>
          ) : null}
          {identity.status === "error" ? (
            <div className="flex items-center justify-between gap-3 text-sm text-red-600">
              <span>设备身份加载失败</span>
              <Button type="button" size="sm" variant="outline" onClick={identity.retry}>
                重试身份
              </Button>
            </div>
          ) : null}
          {error ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
              {claimedPayloads?.command ? (
                <code className="block break-all rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">
                  {claimedPayloads.command}
                </code>
              ) : null}
            </div>
          ) : null}
          {commandReady ? (
            <div className="space-y-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <p>口令已复制</p>
              <p>若未自动跳转，请手动打开中国移动 APP</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => launchApp("leadeon://")}
              >
                <Smartphone data-icon="inline-start" />
                再次唤起
              </Button>
            </div>
          ) : null}
        </div>

        <DrawerFooter>
          {!claimedPayloads ? (
            <>
              {hasUrl ? (
                <Button
                  type="button"
                  className="h-12 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                  disabled={!identityReady || submitting}
                  onClick={() => void handleClaim("URL")}
                >
                  <ExternalLink data-icon="inline-start" />
                  {submitting && pendingMethod === "URL"
                    ? `正在${actionNoun}…`
                    : `使用链接${actionNoun}`}
                </Button>
              ) : null}
              {hasCommand ? (
                <Button
                  type="button"
                  className={`h-12 rounded-xl ${
                    hasUrl
                      ? ""
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                  variant={hasUrl ? "secondary" : "default"}
                  disabled={!identityReady || submitting}
                  onClick={() => void handleClaim("COMMAND")}
                >
                  <Copy data-icon="inline-start" />
                  {submitting && pendingMethod === "COMMAND"
                    ? `正在${actionNoun}…`
                    : `使用口令${actionNoun}`}
                </Button>
              ) : null}
            </>
          ) : !commandReady ? (
            <>
              {claimedPayloads.command ? (
                <Button
                  type="button"
                  className="h-11"
                  onClick={() => void handleClaim("COMMAND")}
                >
                  <Copy data-icon="inline-start" />
                  复制口令
                </Button>
              ) : null}
              {claimedPayloads.url ? (
                <Button
                  type="button"
                  className="h-11"
                  variant={claimedPayloads.command ? "outline" : "default"}
                  onClick={() => void handleClaim("URL")}
                >
                  <ExternalLink data-icon="inline-start" />
                  {claimedPayloads.command ? "改用链接" : "打开链接"}
                </Button>
              ) : null}
            </>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function readClaimSuccess(value: unknown): ClaimSuccess | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClaimSuccess>;
  if (!candidate.payloads || typeof candidate.payloads !== "object") {
    return null;
  }

  const command = candidate.payloads.command;
  const url = candidate.payloads.url;
  if (
    (command !== undefined && typeof command !== "string") ||
    (url !== undefined && typeof url !== "string") ||
    (command === undefined && url === undefined) ||
    typeof candidate.idempotent !== "boolean"
  ) {
    return null;
  }

  return { payloads: { command, url }, idempotent: candidate.idempotent };
}

async function readErrorCode(response: Response) {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : "";
  } catch {
    return "";
  }
}

function defaultLaunchApp(url: string) {
  const injected = (window as Window & {
    __CMCC_LAUNCH_APP__?: (value: string) => void;
  }).__CMCC_LAUNCH_APP__;
  if (injected) {
    injected(url);
    return;
  }
  window.location.href = url;
}

function defaultNavigate(url: string) {
  window.location.href = url;
}
