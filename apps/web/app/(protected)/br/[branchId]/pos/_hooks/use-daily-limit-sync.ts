"use client";

import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { getVNDateString } from "@/_lib/format-datetime";

export interface UseDailyLimitSyncArgs {
  branchId: number;
  /**
   * Fire-and-forget refetch via `fetchDailyLimitsForPos`. MUST be deduped by
   * the caller — every realtime event on `branch_menu_item_daily_limits`
   * triggers this refetch, which resyncs the store wholesale via
   * `store.setAll(...)`. Realtime events carry no state themselves.
   */
  refreshLimits: () => void;
  /**
   * When true, FIRST `SUBSCRIBED` callback skips catchup refresh (state
   * already seeded by RSC via `fetchMenuForPos.daily_limit`). Subsequent
   * SUBSCRIBED events (genuine reconnects) always refresh to catch events
   * missed during disconnect. Per regression
   * REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK.
   */
  skipFirstSubscribedRefresh?: boolean;
}

/**
 * Today's date in Asia/Ho_Chi_Minh as YYYY-MM-DD. Realtime postgres filter
 * supports only simple `eq` so date comparison is client-side — drops
 * yesterday's-row events that arrive after midnight crossover instead of
 * triggering a refetch for a row outside today's view.
 */
function todayHCM(): string {
  return getVNDateString();
}

interface LimitRow {
  limit_date?: unknown;
}

/**
 * Subscribe to `branch_menu_item_daily_limits` realtime stream so the POS
 * menu reflects `sold_today`, `is_disabled`, and `available_to_sell` flips
 * without page reload.
 *
 * INSERT events fire when a manager creates a new daily-limit row (the
 * sales triggers do NOT insert — they no-op when no row exists, see
 * `enforce_branch_menu_daily_limit:123-125`). UPDATE events fire from
 * sales/cancel triggers + manager toggles. DELETE fires when a manager
 * removes a limit (item back to unlimited).
 *
 * Every event is a pure trigger for the deduped `refreshLimits` fetch — no
 * client-side row projection or merge. The refetch is the single source of
 * truth for the store (`setAll`), so a per-row realtime payload has nothing
 * useful to contribute on its own.
 *
 * Cross-branch isolation: Realtime broker enforces RLS on the subscribe
 * JWT plus the explicit `branch_id=eq.${branchId}` filter — branch staff
 * never receive other branches' payloads.
 *
 * Mirrors `useOrderSync`: auth-aware via `useRealtimeChannel`, ref-based
 * setters to avoid stale closures, status callback distinguishes initial
 * vs reconnect SUBSCRIBED.
 */
export function useDailyLimitSync({
  branchId,
  refreshLimits,
  skipFirstSubscribedRefresh = false,
}: UseDailyLimitSyncArgs): void {
  const refreshLimitsRef = useRef(refreshLimits);
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    refreshLimitsRef.current = refreshLimits;
  }, [refreshLimits]);

  useRealtimeChannel(
    (supabase) => {
      const branchFilter = `branch_id=eq.${String(branchId)}`;
      return supabase
        .channel(`pos-daily-limits-branch-${String(branchId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "branch_menu_item_daily_limits",
            filter: branchFilter,
          },
          (payload) => {
            const today = todayHCM();
            const row = (
              payload.eventType === "DELETE" ? payload.old : payload.new
            ) as LimitRow;
            // REPLICA IDENTITY FULL → row carries limit_date on every event.
            if (
              typeof row.limit_date === "string" &&
              row.limit_date !== today
            ) {
              return; // Yesterday's or future row — outside our view.
            }
            refreshLimitsRef.current();
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          // The FIRST SUBSCRIBED is the initial mount. RSC seed
          // (`fetchMenuForPos.daily_limit`) is authoritative — skip the
          // catchup. Subsequent SUBSCRIBED are genuine reconnects and
          // must refetch to fill events missed during disconnect.
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            if (skipFirstSubscribedRefresh) return;
          }
          refreshLimitsRef.current();
        });
    },
    [branchId],
  );
}
