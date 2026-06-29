"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";

interface UseFinanceRealtimeRefreshOptions {
  branchId: number | null;
  enabled?: boolean;
}

const REFRESH_DEBOUNCE_MS = 2500;
const MIN_REFRESH_INTERVAL_MS = 15000;
const AUTO_REFRESH_MS = 60000;

/**
 * Pure function: compute how long to wait before firing router.refresh().
 *
 * Trailing debounce: each payment event resets the timer. The wait is at least
 * REFRESH_DEBOUNCE_MS so a burst of events collapses into one refresh fired
 * REFRESH_DEBOUNCE_MS after the LAST event (must-not-miss: trailing edge).
 * In addition, MIN_REFRESH_INTERVAL_MS is enforced between actual refreshes to
 * prevent rapid re-fetches when reconnects re-fire SUBSCRIBED.
 *
 * Exported for unit testing; not part of the public hook API.
 */
export function computeRefreshWaitMs(
  lastRefreshAt: number,
  now: number,
): number {
  const elapsed = now - lastRefreshAt;
  return Math.max(REFRESH_DEBOUNCE_MS, MIN_REFRESH_INTERVAL_MS - elapsed);
}

export function useFinanceRealtimeRefresh({
  branchId,
  enabled = true,
}: UseFinanceRealtimeRefreshOptions) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const scheduleRefresh = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    const waitMs = computeRefreshWaitMs(lastRefreshAtRef.current, Date.now());
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastRefreshAtRef.current = Date.now();
      router.refresh();
    }, waitMs);
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

    // Pause polling when tab is hidden. Mobile CPUs throttle background
    // tabs; firing router.refresh() every 10s while hidden does nothing
    // useful and stacks up work for when the tab returns. On resume we
    // catch up exactly once if the interval missed a beat.
    let lastRefreshAt = Date.now();
    let interval: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (document.visibilityState !== "visible") return;
      lastRefreshAt = Date.now();
      scheduleRefresh();
    }

    function startInterval() {
      if (interval !== null) return;
      interval = setInterval(tick, AUTO_REFRESH_MS);
    }
    function stopInterval() {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Catch up only if the interval would have fired while hidden.
        if (Date.now() - lastRefreshAt >= AUTO_REFRESH_MS) {
          lastRefreshAt = Date.now();
          scheduleRefresh();
        }
        startInterval();
      } else {
        stopInterval();
      }
    }

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, scheduleRefresh]);
}
