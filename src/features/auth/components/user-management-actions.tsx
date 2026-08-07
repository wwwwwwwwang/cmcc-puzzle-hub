"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { UserStatus } from "../admin";
import {
  banUser,
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
}: {
  targetId: string;
  status: UserStatus;
  isAdmin: boolean;
}) {
  const [banState, banAction, banning] = useActionState<ReviewState, FormData>(
    banUser,
    {},
  );
  const [unbanState, unbanAction, unbanning] = useActionState<
    ReviewState,
    FormData
  >(unbanUser, {});

  const message = banState.error ?? banState.success ?? unbanState.error ?? unbanState.success;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isAdmin && status === "PENDING" ? <ReviewButtons targetId={targetId} /> : null}
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
      {!isAdmin && status !== "BANNED" ? (
        <p className="text-xs leading-5 text-amber-700">
          封禁后开放帖子会下架，待确认求助会结束并按规则处理信用。
        </p>
      ) : null}
      {message ? (
        <p
          role={banState.error || unbanState.error ? "alert" : "status"}
          className="text-xs text-slate-600"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
