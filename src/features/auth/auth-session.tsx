"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AuthSession = {
  isAuthenticated: boolean;
  isAdmin: boolean;
  publicId: string | null;
};

const AuthSessionContext = createContext<AuthSession | null>(null);

export function AuthSessionProvider({
  value,
  children,
}: {
  value: AuthSession;
  children: ReactNode;
}) {
  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return session;
}
