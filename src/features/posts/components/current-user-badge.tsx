"use client";

import { useDeviceIdentity } from "@/features/posts/device/device-provider";

export function CurrentUserBadge() {
  const identity = useDeviceIdentity();

  if (identity.publicIdStatus === "ready" && identity.publicId) {
    return (
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
        <span className="font-medium">当前用户</span>
        <span aria-hidden="true">·</span>
        <code className="truncate font-mono font-semibold">{identity.publicId}</code>
      </div>
    );
  }

  const unavailable =
    identity.status === "error" || identity.publicIdStatus === "error";

  return (
    <p className="text-xs text-slate-400">
      {unavailable ? "身份标识暂不可用" : "正在生成用户标识…"}
    </p>
  );
}
