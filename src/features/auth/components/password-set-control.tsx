"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setUserPassword, type ReviewState } from "../admin-actions";

export function PasswordSetControl({ targetId }: { targetId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    setUserPassword,
    {},
  );

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "收起设置" : "设置密码"}
      </Button>
      {open ? (
        <form action={action} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="targetId" value={targetId} />
          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>新密码</span>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>确认新密码</span>
            <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "保存中…" : "保存密码"}
          </Button>
          {state.error ? <p role="alert" className="text-xs text-destructive">{state.error}</p> : null}
          {state.success ? <p role="status" className="text-xs text-emerald-700">{state.success}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
