"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveUser,
  rejectUser,
  type ReviewState,
} from "../admin-actions";

export function ReviewButtons({ targetId }: { targetId: string }) {
  const [rejectOpen, setRejectOpen] = useState(false);
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
    <div
      role="group"
      aria-label="审核操作"
      className="flex flex-wrap gap-2"
    >
      <div className="flex basis-full flex-wrap items-center gap-2">
        <form action={approveAction}>
          <input type="hidden" name="targetId" value={targetId} />
          <Button type="submit" size="sm" disabled={approving}>
            {approving ? "处理中…" : "通过"}
          </Button>
        </form>
        {!rejectOpen ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            aria-expanded={false}
            onClick={() => setRejectOpen(true)}
          >
            拒绝
          </Button>
        ) : null}
      </div>
      {rejectOpen ? (
        <form
          action={rejectAction}
          className="basis-full space-y-2 rounded-lg border border-rose-100 bg-rose-50/60 p-3"
        >
          <input type="hidden" name="targetId" value={targetId} />
          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>拒绝原因</span>
            <Textarea
              name="reason"
              required
              maxLength={200}
              rows={3}
              placeholder="例如：微信群昵称与用户名不一致"
            />
          </label>
          <p className="text-xs text-slate-500">
            该原因会在用户登录时显示，请勿填写敏感信息。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={rejecting}>
              {rejecting ? "处理中…" : "确认拒绝"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={rejecting}
              onClick={() => setRejectOpen(false)}
            >
              取消
            </Button>
          </div>
        </form>
      ) : null}
      {message ? (
        <span className="block text-xs text-destructive">{message}</span>
      ) : null}
    </div>
  );
}
