"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { UserStatus } from "../admin";
import {
  banUser,
  reopenUserReview,
  unbanUser,
  type ReviewState,
} from "../admin-actions";
import { ReviewButtons } from "./review-buttons";
import { PasswordSetControl } from "./password-set-control";

const BAN_CONFIRM_MESSAGE =
  "确认封禁该用户？开放帖子会下架并退回求助信用，等待确认的助力会结束且不发放助力信用。";

export function UserManagementActions({
  targetId,
  status,
  isAdmin,
  rejectionReason,
}: {
  targetId: string;
  status: UserStatus;
  isAdmin: boolean;
  rejectionReason?: string | null;
}) {
  const [banState, banAction, banning] = useActionState<ReviewState, FormData>(
    banUser,
    {},
  );
  const [unbanState, unbanAction, unbanning] = useActionState<
    ReviewState,
    FormData
  >(unbanUser, {});
  const [reopenState, reopenAction, reopening] = useActionState<
    ReviewState,
    FormData
  >(reopenUserReview, {});

  const message =
    banState.error ??
    banState.success ??
    unbanState.error ??
    unbanState.success ??
    reopenState.error ??
    reopenState.success;

  return (
    <div className="space-y-2">
      {!isAdmin && status === "REJECTED" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">拒绝原因</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
            {rejectionReason?.trim() || "审核未通过，请联系管理员确认"}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {!isAdmin && status === "PENDING" ? <ReviewButtons targetId={targetId} /> : null}
        {!isAdmin && status === "REJECTED" ? (
          <form action={reopenAction}>
            <input type="hidden" name="targetId" value={targetId} />
            <Button type="submit" size="sm" disabled={reopening}>
              {reopening ? "处理中…" : "恢复待审核"}
            </Button>
          </form>
        ) : null}
        {!isAdmin && status !== "BANNED" ? (
          <form
            action={banAction}
            onSubmit={(event) => {
              if (!window.confirm(BAN_CONFIRM_MESSAGE)) event.preventDefault();
            }}
          >
            <input type="hidden" name="targetId" value={targetId} />
            <Button type="submit" size="sm" variant="destructive" disabled={banning}>
              {banning ? "处理中…" : "封禁"}
            </Button>
          </form>
        ) : null}
        {!isAdmin && status === "BANNED" ? (
          <form action={unbanAction}>
            <input type="hidden" name="targetId" value={targetId} />
            <Button type="submit" size="sm" disabled={unbanning}>
              {unbanning ? "处理中…" : "解封"}
            </Button>
          </form>
        ) : null}
      </div>
      {!isAdmin ? <PasswordSetControl targetId={targetId} /> : null}
      {message ? (
        <p
          role={banState.error || unbanState.error || reopenState.error ? "alert" : "status"}
          className="text-xs text-slate-600"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
