"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";

const POLL_INTERVAL_MS = 15_000;

export function RunnerRealtimeRefresh({ branchId }: { branchId: number }) {
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

  useRealtimeChannel(
    (supabase) =>
      supabase
        .channel(`runner-board-${String(branchId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "kds_tickets",
            filter: `branch_id=eq.${String(branchId)}`,
          },
          refresh,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `branch_id=eq.${String(branchId)}`,
          },
          refresh,
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") refresh();
        }),
    [branchId, refresh],
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
