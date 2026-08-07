"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthActionState } from "../actions";

type AuthAction = (
  state: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

type AuthFormProps = {
  action: AuthAction;
  submitLabel: string;
  redirectTo?: string;
};

export function AuthForm({ action, submitLabel, redirectTo }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {redirectTo ? (
        <input type="hidden" name="redirect" value={redirectTo} />
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-semibold text-slate-800">
          用户名
        </label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          aria-invalid={Boolean(state.fieldErrors?.username)}
          className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3 shadow-none focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
        />
        {state.fieldErrors?.username ? (
          <p className="text-xs leading-5 text-destructive">{state.fieldErrors.username}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-800">
          密码
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3 shadow-none focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
        />
        {state.fieldErrors?.password ? (
          <p className="text-xs leading-5 text-destructive">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm leading-5 text-rose-700"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700"
        disabled={pending}
      >
        {pending ? "处理中…" : submitLabel}
      </Button>
    </form>
  );
}
