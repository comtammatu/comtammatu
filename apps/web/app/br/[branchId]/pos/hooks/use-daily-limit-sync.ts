"use client";

import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { getVNDateString } from "@/_lib/format-datetime";
import type { MenuItemDailyLimit } from "../pos-menu-types";
import type { DailyLimitStore } from "../_providers/daily-limit-store";

export interface UseDailyLimitSyncArgs {
  branchId: number;
  /**
   * External store owned by the provider. Realtime handlers mutate via
   * `store.set(itemId, value | null)`; the store decides whether to notify
   * subscribers based on per-slice equality, so a no-op event (e.g. trigger
   * fires but `sold_today` unchanged) skips re-render.
   */
  store: DailyLimitStore;
  /**
   * Fire-and-forget refetch via `fetchDailyLimitsForPos`. MUST be deduped by
   * the caller — fired on SUBSCRIBED reconnect (catchup events missed during
   * disconnect) and on payloads where REPLICA IDENTITY FULL safety net
   * still drops `menu_item_id` (shouldn't happen but defense-in-depth).
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
 * mutating today's local map with stale data.
 */
function todayHCM(): string {
  return getVNDateString();
}

interface LimitRow {
  id?: unknown;
  menu_item_id?: unknown;
  branch_id?: unknown;
  limit_date?: unknown;
  limit_quantity?: unknown;
  is_disabled?: unknown;
  sold_today?: unknown;
}

function projectLimit(row: LimitRow): {
  menu_item_id: number;
  limit: MenuItemDailyLimit;
} | null {
  const itemId =
    typeof row.menu_item_id === "number"
      ? row.menu_item_id
      : Number(row.menu_item_id);
  if (!Number.isFinite(itemId)) return null;

  const limitQty =
    row.limit_quantity === null || row.limit_quantity === undefined
      ? null
      : typeof row.limit_quantity === "number"
        ? row.limit_quantity
        : Number(row.limit_quantity);

  const sold =
    typeof row.sold_today === "number"
      ? row.sold_today
      : Number(row.sold_today ?? 0);

  return {
    menu_item_id: itemId,
    limit: {
      limit_quantity:
        limitQty !== null && Number.isFinite(limitQty) ? limitQty : null,
      is_disabled: row.is_disabled === true,
      sold_today: Number.isFinite(sold) ? sold : 0,
    },
  };
}

/**
 * Subscribe to `branch_menu_item_daily_limits` realtime stream so the POS
 * menu reflects `sold_today` and `is_disabled` flips without page reload.
 *
 * INSERT events fire when a manager creates a new daily-limit row (the
 * sales triggers do NOT insert — they no-op when no row exists, see
 * `enforce_branch_menu_daily_limit:123-125`). UPDATE events fire from
 * sales/cancel triggers + manager toggles. DELETE fires when a manager
 * removes a limit (item back to unlimited).
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
  store,
  refreshLimits,
  skipFirstSubscribedRefresh = false,
}: UseDailyLimitSyncArgs): void {
  const storeRef = useRef(store);
  const refreshLimitsRef = useRef(refreshLimits);
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    storeRef.current = store;
    refreshLimitsRef.current = refreshLimits;
  }, [store, refreshLimits]);

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
            const eventType = payload.eventType;
            const today = todayHCM();

            if (eventType === "DELETE") {
              const old = (payload.old ?? {}) as LimitRow;
              // REPLICA IDENTITY FULL → old carries menu_item_id + limit_date.
              if (
                typeof old.limit_date === "string" &&
                old.limit_date !== today
              ) {
                return; // Yesterday's row — outside our view.
              }
              const itemId =
                typeof old.menu_item_id === "number"
                  ? old.menu_item_id
                  : Number(old.menu_item_id);
              if (!Number.isFinite(itemId)) {
                refreshLimitsRef.current();
                return;
              }
              storeRef.current.set(itemId, null);
              return;
            }

            // INSERT or UPDATE → consume payload.new
            const next = (payload.new ?? {}) as LimitRow;
            if (
              typeof next.limit_date === "string" &&
              next.limit_date !== today
            ) {
              return; // Future or yesterday row — ignore.
            }
            const projected = projectLimit(next);
            if (projected === null) {
              refreshLimitsRef.current();
              return;
            }
            storeRef.current.set(projected.menu_item_id, projected.limit);
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
