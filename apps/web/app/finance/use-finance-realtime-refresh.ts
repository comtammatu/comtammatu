"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";

interface UseFinanceRealtimeRefreshOptions {
  branchId: number | null;
  enabled?: boolean;
}

const REFRESH_DEBOUNCE_MS = 1500;
const AUTO_REFRESH_MS = 10000;

export function useFinanceRealtimeRefresh({
  branchId,
  enabled = true,
}: UseFinanceRealtimeRefreshOptions) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [enabled, router]);

  useRealtimeChannel(
    (supabase) => {
      if (!enabled) return null;
      let initialSubscribe = true;
      const filter =
        branchId == null ? undefined : `branch_id=eq.${String(branchId)}`;

      return supabase
        .channel(
          branchId == null
            ? "finance-revenue-payments-all"
            : `finance-revenue-payments-${String(branchId)}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "payments",
            filter,
          },
          () => scheduleRefresh(),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (initialSubscribe) {
              initialSubscribe = false;
              return;
            }
            scheduleRefresh();
          }
        });
    },
    [branchId, enabled, router, scheduleRefresh],
  );

  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    }

    const interval = setInterval(scheduleRefresh, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, scheduleRefresh]);
}
