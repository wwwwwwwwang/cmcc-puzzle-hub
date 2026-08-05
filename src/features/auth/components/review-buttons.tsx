"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  approveUser,
  rejectUser,
  type ReviewState,
} from "../admin-actions";

export function ReviewButtons({ targetId }: { targetId: string }) {
  const [approveState, approveAction, approving] = useActionState<
    ReviewState,
    FormData
  >(approveUser, {});
  const [rejectState, rejectAction, rejecting] = useActionState<
    ReviewState,
    FormData
  >(rejectUser, {});

  const message = approveState.error ?? rejectState.error;

  return (
    <div className="flex items-center gap-2">
      <form action={approveAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <Button type="submit" size="sm" disabled={approving}>
          {approving ? "处理中…" : "通过"}
        </Button>
      </form>
      <form action={rejectAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <Button type="submit" size="sm" variant="destructive" disabled={rejecting}>
          {rejecting ? "处理中…" : "拒绝"}
        </Button>
      </form>
      {message ? (
        <span className="text-xs text-destructive">{message}</span>
      ) : null}
    </div>
  );
}
