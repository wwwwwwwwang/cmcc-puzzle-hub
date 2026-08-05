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
type PublicIdStatus = "idle" | "loading" | "ready" | "error";
export type PublicIdLoader = (visitorId: string) => Promise<string>;

type PublicIdentityResult =
  | { visitorId: null; publicId: null; status: "idle" }
  | {
      visitorId: string;
      publicId: string | null;
      status: "ready" | "error";
    };

export type DeviceIdentity = {
  visitorId: string | null;
  status: DeviceIdentityStatus;
  publicId: string | null;
  publicIdStatus: PublicIdStatus;
  retry: () => void;
};

type DeviceIdentityProviderProps = {
  children: ReactNode;
  loader?: VisitorIdLoader;
  publicIdLoader?: PublicIdLoader;
};

const DeviceIdentityContext = createContext<DeviceIdentity | null>(null);

export function DeviceIdentityProvider({
  children,
  loader,
  publicIdLoader = defaultPublicIdLoader,
}: DeviceIdentityProviderProps) {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [status, setStatus] = useState<DeviceIdentityStatus>("loading");
  const [publicIdentity, setPublicIdentity] = useState<PublicIdentityResult>({
    visitorId: null,
    publicId: null,
    status: "idle",
  });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setVisitorId(null);
    setStatus("loading");
    setPublicIdentity({ visitorId: null, publicId: null, status: "idle" });
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

  useEffect(() => {
    if (!visitorId) return;

    let active = true;

    publicIdLoader(visitorId).then(
      (nextPublicId) => {
        if (!active) return;
        setPublicIdentity({
          visitorId,
          publicId: nextPublicId,
          status: "ready",
        });
      },
      () => {
        if (!active) return;
        setPublicIdentity({ visitorId, publicId: null, status: "error" });
      },
    );

    return () => {
      active = false;
    };
  }, [publicIdLoader, visitorId]);

  const currentPublicIdentity =
    visitorId && publicIdentity.visitorId === visitorId ? publicIdentity : null;
  const publicId = currentPublicIdentity?.publicId ?? null;
  const publicIdStatus: PublicIdStatus = visitorId
    ? (currentPublicIdentity?.status ?? "loading")
    : "idle";

  const value = useMemo(
    () => ({ visitorId, status, publicId, publicIdStatus, retry }),
    [publicId, publicIdStatus, retry, status, visitorId],
  );

  return (
    <DeviceIdentityContext.Provider value={value}>
      {children}
    </DeviceIdentityContext.Provider>
  );
}

async function defaultPublicIdLoader(visitorId: string) {
  const response = await fetch("/api/identity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId }),
  });
  if (!response.ok) throw new Error("Public identity request failed");

  const body = (await response.json()) as { publicId?: unknown };
  if (
    typeof body.publicId !== "string" ||
    !/^U-[0-9A-F]{16}$/.test(body.publicId)
  ) {
    throw new Error("Invalid public identity response");
  }

  return body.publicId;
}

export function useDeviceIdentity() {
  const identity = useContext(DeviceIdentityContext);

  if (!identity) {
    throw new Error("useDeviceIdentity must be used within DeviceIdentityProvider");
  }

  return identity;
}
