"use client";

import { useEffect, useState } from "react";

function formatDuration(remainingMs: number) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function ConfirmationCountdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.max(0, Date.parse(deadline) - now);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time
      dateTime={deadline}
      aria-label="自动确认倒计时"
      className="tabular-nums"
    >
      {remainingMs > 0
        ? `剩余 ${formatDuration(remainingMs)}`
        : "等待系统自动确认"}
    </time>
  );
}
