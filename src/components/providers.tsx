"use client";

import type { ReactNode } from "react";

import { DeviceIdentityProvider } from "@/features/posts/device/device-provider";

export function Providers({ children }: { children: ReactNode }) {
  return <DeviceIdentityProvider>{children}</DeviceIdentityProvider>;
}
