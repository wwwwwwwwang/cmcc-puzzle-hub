"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AccountActivity } from "@/features/posts/server/user-queries";

type AccountActivityRefreshProps = {
  pendingKind: "confirmation" | "help";
  initialPendingCount: number;
};

export function AccountActivityRefresh({
  pendingKind,
  initialPendingCount,
}: AccountActivityRefreshProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingCountRef = useRef(initialPendingCount);
  const versionRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    pendingCountRef.current = initialPendingCount;
  }, [initialPendingCount]);

  const requestActivity = useCallback(
    (forceRefresh = false) => {
      if (forceRefresh) forceRefreshRef.current = true;
      if (inFlightRef.current) return inFlightRef.current;

      const controller = new AbortController();
      controllerRef.current = controller;
      setRefreshing(true);

      const request = (async () => {
        try {
          const response = await fetch("/api/me/activity", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("activity request failed");

          const activity = readAccountActivity(await response.json());
          if (!activity) throw new Error("invalid activity response");

          const pendingCount =
            pendingKind === "confirmation"
              ? activity.pendingConfirmationCount
              : activity.pendingHelpCount;
          const countChanged = pendingCount !== pendingCountRef.current;
          const versionChanged =
            versionRef.current !== null && activity.version !== versionRef.current;

          pendingCountRef.current = pendingCount;
          versionRef.current = activity.version;
          setError(null);

          if (forceRefreshRef.current || countChanged || versionChanged) {
            router.refresh();
          }
        } catch (requestError) {
          if (
            !(requestError instanceof DOMException) ||
            requestError.name !== "AbortError"
          ) {
            setError("刷新失败，稍后将自动重试");
          }
        } finally {
          if (controllerRef.current === controller) {
            controllerRef.current = null;
            inFlightRef.current = null;
            forceRefreshRef.current = false;
            setRefreshing(false);
          }
        }
      })();

      inFlightRef.current = request;
      return request;
    },
    [pendingKind, router],
  );

  useEffect(() => {
    if (initialPendingCount <= 0) return;

    const checkVisibleActivity = () => {
      if (!document.hidden) void requestActivity();
    };
    const timer = window.setInterval(checkVisibleActivity, 30_000);
    window.addEventListener("focus", checkVisibleActivity);
    document.addEventListener("visibilitychange", checkVisibleActivity);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkVisibleActivity);
      document.removeEventListener("visibilitychange", checkVisibleActivity);
    };
  }, [initialPendingCount, requestActivity]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="status" className="text-xs text-slate-500">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="刷新状态"
        title="刷新状态"
        disabled={refreshing}
        onClick={() => void requestActivity(true)}
      >
        <RefreshCw className={refreshing ? "animate-spin" : undefined} />
      </Button>
    </div>
  );
}

function readAccountActivity(value: unknown): AccountActivity | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountActivity>;
  if (
    typeof candidate.pendingConfirmationCount !== "number" ||
    typeof candidate.pendingHelpCount !== "number" ||
    typeof candidate.version !== "string"
  ) {
    return null;
  }
  return {
    pendingConfirmationCount: candidate.pendingConfirmationCount,
    pendingHelpCount: candidate.pendingHelpCount,
    version: candidate.version,
  };
}
