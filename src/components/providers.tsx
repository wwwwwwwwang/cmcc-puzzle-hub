"use client";

import type { ReactNode } from "react";

import {
  AuthSessionProvider,
  type AuthSession,
} from "@/features/auth/auth-session";

export function Providers({
  children,
  session,
}: {
  children: ReactNode;
  session: AuthSession;
}) {
  return <AuthSessionProvider value={session}>{children}</AuthSessionProvider>;
}
