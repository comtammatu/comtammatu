"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";

// The pickup board is a derived "now serving" view for every order, so it cannot
// take cheap per-row realtime updates the way KDS does — any change still needs a
// full queue rebuild. Polling keeps a deterministic max staleness on an
// always-visible kiosk even if the realtime socket drops silently. 6s halves the
// per-shift refresh count vs the previous 3s while staying inside the tolerance a
// customer reads on a number-calling board.
const POLL_INTERVAL_MS = 6_000;

export function PickupRealtimeRefresh() {
  const router = useRouter();
  const refresh = useMemo(
    () =>
      makeRealtimeCoalescer(
        async () => {
          router.refresh();
        },
        undefined,
        { metricName: "pickup.board.refresh" },
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
