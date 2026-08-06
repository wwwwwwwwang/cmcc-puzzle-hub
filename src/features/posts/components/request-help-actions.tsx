"use client";

import { Check, XCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  confirmReceived,
  reportNotReceived,
  type RequestHelpActionState,
} from "@/features/posts/server/actions";

export function RequestHelpActions({ postId }: { postId: string }) {
  const [confirmState, confirmAction, confirming] = useActionState<
    RequestHelpActionState,
    FormData
  >(confirmReceived, {});
  const [reportState, reportAction, reporting] = useActionState<
    RequestHelpActionState,
    FormData
  >(reportNotReceived, {});
  const pending = confirming || reporting;
  const message =
    confirmState.error ??
    reportState.error ??
    confirmState.success ??
    reportState.success;
  const isError = Boolean(confirmState.error ?? reportState.error);

  return (
    <div
      role="group"
      aria-label="求助收货操作"
      className="flex flex-wrap items-center gap-2"
    >
      <form action={confirmAction}>
        <input type="hidden" name="postId" value={postId} />
        <Button type="submit" size="sm" disabled={pending}>
          <Check data-icon="inline-start" />
          {confirming ? "确认中…" : "确认已收到"}
        </Button>
      </form>

      <form
        action={reportAction}
        onSubmit={(event) => {
          if (!window.confirm("确认未收到拼图？帖子将重新开放。")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="postId" value={postId} />
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          <XCircle data-icon="inline-start" />
          {reporting ? "反馈中…" : "未收到"}
        </Button>
      </form>

      {message ? (
        <p
          role={isError ? "alert" : "status"}
          className={
            isError
              ? "basis-full text-xs text-destructive"
              : "basis-full text-xs text-muted-foreground"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
