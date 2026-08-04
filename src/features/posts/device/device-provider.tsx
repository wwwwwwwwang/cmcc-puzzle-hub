"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getPersistentVisitorId, type VisitorIdLoader } from "./client";

type DeviceIdentityStatus = "loading" | "ready" | "error";

type DeviceIdentity = {
  visitorId: string | null;
  status: DeviceIdentityStatus;
  retry: () => void;
};

type DeviceIdentityProviderProps = {
  children: ReactNode;
  loader?: VisitorIdLoader;
};

const DeviceIdentityContext = createContext<DeviceIdentity | null>(null);

export function DeviceIdentityProvider({
  children,
  loader,
}: DeviceIdentityProviderProps) {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [status, setStatus] = useState<DeviceIdentityStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setVisitorId(null);
    setStatus("loading");
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  useEffect(() => {
    let active = true;

    getPersistentVisitorId(loader).then(
      (nextVisitorId) => {
        if (!active) return;
        setVisitorId(nextVisitorId);
        setStatus("ready");
      },
      () => {
        if (!active) return;
        setVisitorId(null);
        setStatus("error");
      },
    );

    return () => {
      active = false;
    };
  }, [attempt, loader]);

  const value = useMemo(
    () => ({ visitorId, status, retry }),
    [retry, status, visitorId],
  );

  return (
    <DeviceIdentityContext.Provider value={value}>
      {children}
    </DeviceIdentityContext.Provider>
  );
}

export function useDeviceIdentity() {
  const identity = useContext(DeviceIdentityContext);

  if (!identity) {
    throw new Error("useDeviceIdentity must be used within DeviceIdentityProvider");
  }

  return identity;
}
