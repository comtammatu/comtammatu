"use client";

import { useRealtimeRefresh } from "@/_hooks/use-realtime-refresh";

// Re-exported so existing unit tests keep their import path stable.
export { computeRefreshWaitMs } from "@/_hooks/use-realtime-refresh";

interface UseFinanceRealtimeRefreshOptions {
  branchId: number | null;
  enabled?: boolean;
}

/**
 * Live-refresh the finance surface on payment / SePay-webhook events. Thin
 * finance-specific wrapper over useRealtimeRefresh (postgres_changes transport).
 */
export function useFinanceRealtimeRefresh({
  branchId,
  enabled = true,
}: UseFinanceRealtimeRefreshOptions) {
  useRealtimeRefresh({
    enabled,
    deps: [branchId],
    setupChannel: (supabase, scheduleRefresh) => {
      let initialSubscribe = true;
      const filter =
        branchId == null ? undefined : `branch_id=eq.${String(branchId)}`;

      return supabase
        .channel(
          branchId == null
            ? "finance-money-events-all"
            : `finance-money-events-${String(branchId)}`,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments", filter },
          () => scheduleRefresh(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "webhook_events",
            filter: "provider=eq.sepay",
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
  });
}
