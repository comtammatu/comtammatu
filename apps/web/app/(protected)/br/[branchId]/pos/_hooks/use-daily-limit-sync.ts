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
  stock_capacity?: unknown;
  stock_capacity_live?: unknown;
  manual_limit_quantity?: unknown;
  accepted_today?: unknown;
  pending_unfinalized_demand?: unknown;
  active_hold_demand?: unknown;
  available_to_sell?: unknown;
}

function hasField(row: LimitRow, field: keyof LimitRow): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
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

  const limitQty = numberOrNull(row.limit_quantity);
  const stockCap = numberOrNull(row.stock_capacity);

  return {
    menu_item_id: itemId,
    limit: {
      limit_quantity: limitQty,
      is_disabled: row.is_disabled === true,
      sold_today: numberOrZero(row.sold_today),
      stock_capacity: stockCap,
      stock_capacity_live: hasField(row, "stock_capacity_live")
        ? numberOrNull(row.stock_capacity_live)
        : stockCap,
      manual_limit_quantity: hasField(row, "manual_limit_quantity")
        ? numberOrNull(row.manual_limit_quantity)
        : limitQty,
      accepted_today: hasField(row, "accepted_today")
        ? numberOrNull(row.accepted_today)
        : numberOrZero(row.sold_today),
      pending_unfinalized_demand: hasField(row, "pending_unfinalized_demand")
        ? numberOrZero(row.pending_unfinalized_demand)
        : undefined,
      active_hold_demand: hasField(row, "active_hold_demand")
        ? numberOrZero(row.active_hold_demand)
        : undefined,
      available_to_sell: hasField(row, "available_to_sell")
        ? numberOrNull(row.available_to_sell)
        : undefined,
    },
  };
}

function mergeRealtimeLimit(
  previous: MenuItemDailyLimit | null,
  next: MenuItemDailyLimit,
): MenuItemDailyLimit {
  return {
    ...next,
    pending_unfinalized_demand:
      next.pending_unfinalized_demand !== undefined
        ? next.pending_unfinalized_demand
        : previous?.pending_unfinalized_demand,
    active_hold_demand:
      next.active_hold_demand !== undefined
        ? next.active_hold_demand
        : previous?.active_hold_demand,
    available_to_sell:
      next.available_to_sell !== undefined
        ? next.available_to_sell
        : previous?.available_to_sell,
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
            const previous = storeRef.current.get(projected.menu_item_id);
            storeRef.current.set(
              projected.menu_item_id,
              mergeRealtimeLimit(previous, projected.limit),
            );
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
