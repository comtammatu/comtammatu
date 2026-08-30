"use client";

import { useCallback, useMemo } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeRefresh } from "@/_hooks/use-realtime-refresh";

// Re-exported so existing unit tests keep their import path stable.
export { computeRefreshWaitMs } from "@/_hooks/use-realtime-refresh";

export type FinanceRealtimeEvent = "payment" | "sepay";

/**
 * Which postgres_changes events should trigger router.refresh on the current
 * finance route. Empty → no subscription (e.g. food-cost is report-only).
 */
export function resolveFinanceRealtimeEvents(
  pathname: string | null,
): FinanceRealtimeEvent[] {
  if (pathname == null || !pathname.startsWith("/finance")) return [];

  const segment = pathname.split("/")[2] ?? "";

  // Hub P&L is payment-driven; SePay webhooks only matter on bank/AP surfaces.
  if (segment === "") {
    return ["payment"];
  }

  switch (segment) {
    case "bank-transactions":
      return ["sepay", "payment"];
    case "expenses":
    case "equipment":
    case "revenue":
    case "invoices":
    case "targets":
      return ["payment"];
    case "supplier-invoices":
      return ["payment", "sepay"];
    case "food-cost":
      return [];
    default:
      return ["payment", "sepay"];
  }
}

interface UseFinanceRealtimeRefreshOptions {
  branchId: number | null;
  pathname: string | null;
  enabled?: boolean;
}

/**
 * Live-refresh the finance surface on payment / SePay-webhook events. Scoped
 * to the active finance route so unrelated LIST pages do not re-fetch on every
 * webhook. Skips refresh while the tab is hidden; debounce/rate-limit unchanged.
 */
export function useFinanceRealtimeRefresh({
  branchId,
  pathname,
  enabled = true,
}: UseFinanceRealtimeRefreshOptions) {
  const eventScope = useMemo(
    () => resolveFinanceRealtimeEvents(pathname),
    [pathname],
  );
  const routeEnabled = enabled && eventScope.length > 0;
  const eventScopeKey = eventScope.join(",");

  const setupChannel = useCallback(
    (
      supabase: SupabaseClient,
      scheduleRefresh: () => void,
      _token: string | null,
      reportStatus: (status: string) => void,
    ): RealtimeChannel => {
      let initialSubscribe = true;
      const filter =
        branchId == null ? undefined : `branch_id=eq.${String(branchId)}`;

      const scopedRefresh = (event: FinanceRealtimeEvent) => {
        if (document.visibilityState === "hidden") return;
        if (!eventScope.includes(event)) return;
        scheduleRefresh();
      };

      return supabase
        .channel(
          branchId == null
            ? "finance-money-events-all"
            : `finance-money-events-${String(branchId)}`,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments", filter },
          () => scopedRefresh("payment"),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "webhook_events",
            filter: "provider=eq.sepay",
          },
          () => scopedRefresh("sepay"),
        )
        .subscribe((status: string) => {
          reportStatus(status);
          if (status === "SUBSCRIBED") {
            if (initialSubscribe) {
              initialSubscribe = false;
              return;
            }
            if (document.visibilityState === "hidden") return;
            scheduleRefresh();
          }
        });
    },
    [branchId, eventScope, eventScopeKey],
  );

  useRealtimeRefresh({
    enabled: routeEnabled,
    deps: [branchId, pathname, eventScopeKey],
    setupChannel,
  });
}
