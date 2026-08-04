import type { ReactNode } from "react";

import { BottomNav } from "@/components/bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-white shadow-sm">
      <main className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
