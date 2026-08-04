"use client";

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
import { useDeviceIdentity } from "@/features/posts/device/device-provider";
import { parseUrl } from "@/features/posts/domain/parse-url";
import type { HallPostDto, PayloadKind } from "@/features/posts/domain/types";

type ClaimDrawerProps = {
  post: HallPostDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClaimed: (postId: string) => void;
  launchApp?: (url: string) => void;
  navigate?: (url: string) => void;
};

type ClaimSuccess = {
  payloadKind: PayloadKind;
  payload: string;
};

const errorMessages: Record<string, string> = {
  SELF_CLAIM_FORBIDDEN: "不能领取自己发布的内容",
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
  const [error, setError] = useState<string | null>(null);
  const [commandReady, setCommandReady] = useState(false);
  const submittingRef = useRef(false);

  async function handleClaim() {
    if (
      identity.status !== "ready" ||
      identity.visitorId === null ||
      submittingRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
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
        setError(errorMessages[code] ?? "领取失败，请稍后重试");
        return;
      }

      const result = (await response.json()) as ClaimSuccess;
      if (result.payloadKind === "COMMAND") {
        try {
          await navigator.clipboard.writeText(result.payload);
        } catch {
          setError("复制失败，请允许剪贴板权限后重试");
          return;
        }
        setCommandReady(true);
        launchApp("leadeon://");
        return;
      }

      try {
        parseUrl(result.payload);
      } catch {
        setError("领取链接无效，请稍后重试");
        return;
      }
      navigate(result.payload);
    } catch {
      setError("网络连接失败，请检查网络后重试");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const identityReady = identity.status === "ready" && identity.visitorId !== null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>确认领取拼图</DrawerTitle>
          <DrawerDescription>
            {post.discount === 95 ? "95折" : post.discount === 90 ? "9折" : "8折"}
            {post.pieceNumber}号 · {post.type === "GIVE" ? "赠送" : "求助"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 py-5">
          <p className="text-sm text-slate-600">确认后才会领取并打开对应内容。</p>
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
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {commandReady ? (
            <div className="space-y-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              <p>口令已复制</p>
              <p>若未自动跳转，请手动打开中国移动 APP</p>
              <Button type="button" size="sm" variant="outline" onClick={() => launchApp("leadeon://")}>
                再次唤起
              </Button>
            </div>
          ) : null}
        </div>

        <DrawerFooter>
          <Button
            type="button"
            className="h-11"
            disabled={!identityReady || submitting || commandReady}
            onClick={handleClaim}
          >
            {submitting ? "正在领取…" : "确认领取"}
          </Button>
          <Button type="button" className="h-11" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
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

function defaultLaunchApp(url: string) {
  window.location.href = url;
}

function defaultNavigate(url: string) {
  window.location.href = url;
}
