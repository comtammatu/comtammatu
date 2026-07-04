"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";

const POLL_INTERVAL_MS = 3_000;

export function RunnerRealtimeRefresh() {
  const router = useRouter();
  const refresh = useMemo(
    () =>
      makeRealtimeCoalescer(
        async () => {
          router.refresh();
        },
        undefined,
        { metricName: "runner.board.refresh" },
      ),
    [router],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  return null;
}
