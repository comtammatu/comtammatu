"use client";

import { useEffect, useState } from "react";

const PICKUP_WAIT_TICK_MS = 1_000;

export function PickupWaitTime({
  startIso,
  initialNowMs,
}: {
  startIso: string;
  initialNowMs: number;
}) {
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    const tick = () => {
      setNowMs(Date.now());
    };
    tick();

    const intervalId = window.setInterval(tick, PICKUP_WAIT_TICK_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return <>{formatPickupWaitTime(startIso, nowMs)}</>;
}

export function formatPickupWaitTime(startIso: string, nowMs: number): string {
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return "0s";

  const totalSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  if (totalSeconds < 60) return `${String(totalSeconds)}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${String(totalMinutes)}p`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${String(hours)}g`;
  return `${String(hours)}g ${String(minutes)}p`;
}
