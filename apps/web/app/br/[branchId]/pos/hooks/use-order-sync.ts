"use client";

import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import type { BranchTable } from "../page";
import type { SessionOrder } from "../order-history";

const STALE_POLL_MS = 20_000;

export interface UseOrderSyncArgs {
  branchId: number;
  setTables: React.Dispatch<React.SetStateAction<BranchTable[]>>;
  setOrders: React.Dispatch<React.SetStateAction<SessionOrder[]>>;
  /**
   * Returns the latest tables snapshot. Used to resolve `tables.number`
   * for ORDERS INSERT payloads, since `postgres_changes` carries only
   * the row's own columns (no joins) — without this, an optimistic
   * insert would render `Bàn —` until the deduped fetch fallback returns.
   */
  getTables: () => BranchTable[];
  /**
   * Fire-and-forget refresh of the active orders list. MUST already
   * be deduped by the caller — used as a fallback after optimistic
   * INSERT (the optimistic mapping may miss fields the server query
   * applies) and as a safety net on UPDATE/DELETE when the payload
   * doesn't carry the row id.
   */
  refreshOrders: () => void;
  /**
   * Fire-and-forget full refresh (orders + tables). Also caller-deduped.
   * Invoked on SUBSCRIBED-reconnect and the stale visibility poll.
   */
  refreshAll: () => void;
  /**
   * Fired when an existing order flips into a terminal state (paid /
   * completed / cancelled). The provider bumps a token; the archived
   * sheet's pagination hook listens and resets to page 1. Active list
   * itself is patched independently — this callback does NOT replace
   * the active-side state mutation.
   */
  onArchivedInvalidate?: () => void;
  /**
   * When true, the FIRST `SUBSCRIBED` callback (initial mount subscription)
   * does not fire a catch-up refresh — orders are already seeded by the
   * caller (e.g. via RSC prefetch). Later SUBSCRIBED events (genuine
   * reconnects) always refresh to catch missed events during disconnect.
   */
  skipFirstSubscribedRefresh?: boolean;
}

// Realtime payload row carries only orders-table columns (no join). Spreading
// raw row over a SessionOrder would leak unknown fields, so we project only
// the SessionOrder shape and coerce numeric/text variants supabase-realtime
// stringifies (e.g. NUMERIC → string).
function applyOrderUpdate(
  current: SessionOrder,
  payload: Record<string, unknown>,
): SessionOrder {
  const next: SessionOrder = { ...current };
  if (typeof payload.order_number === "string")
    next.order_number = payload.order_number;
  if (typeof payload.order_type === "string")
    next.order_type = payload.order_type;
  if (typeof payload.status === "string") next.status = payload.status;
  if (payload.payment_status === null) {
    next.payment_status = null;
  } else if (typeof payload.payment_status === "string") {
    next.payment_status = payload.payment_status;
  }
  if (payload.total_amount !== undefined && payload.total_amount !== null) {
    next.total_amount = Number(payload.total_amount);
  }
  if (payload.table_id === null) {
    next.table_id = null;
  } else if (typeof payload.table_id === "number") {
    next.table_id = payload.table_id;
  }
  if (typeof payload.created_at === "string")
    next.created_at = payload.created_at;
  // `tables` join intentionally preserved from `current` — payload has no joins.
  return next;
}

function buildOptimisticOrder(
  payload: Record<string, unknown>,
  tables: BranchTable[],
): SessionOrder | null {
  const id = typeof payload.id === "number" ? payload.id : Number(payload.id);
  if (!Number.isFinite(id)) return null;

  const tableId =
    payload.table_id === null
      ? null
      : typeof payload.table_id === "number"
        ? payload.table_id
        : Number(payload.table_id);
  const safeTableId =
    typeof tableId === "number" && Number.isFinite(tableId) ? tableId : null;
  const tableNumber =
    safeTableId !== null
      ? (tables.find((t) => t.id === safeTableId)?.number ?? null)
      : null;

  return {
    id,
    order_number: String(payload.order_number ?? ""),
    order_type: String(payload.order_type ?? ""),
    status: String(payload.status ?? "new"),
    payment_status:
      payload.payment_status === null
        ? null
        : typeof payload.payment_status === "string"
          ? payload.payment_status
          : null,
    total_amount: Number(payload.total_amount ?? 0),
    table_id: safeTableId,
    created_at:
      typeof payload.created_at === "string"
        ? payload.created_at
        : new Date().toISOString(),
    tables: tableNumber !== null ? { number: tableNumber } : null,
  };
}

// Current transport: Supabase Realtime postgres_changes on `orders` + `tables`,
// branch-scoped via URL branchId. Interface is stable so a Phase-2 local-first
// swap can replace the implementation without touching callers.
//
// Auth-await + setAuth-before-subscribe lives in `useRealtimeChannel` so this
// hook (and every other realtime sub in the app) doesn't repeat the dance.
//
// Orders handler applies `payload.new` directly for UPDATE/DELETE so status
// flips render in <50ms (vs ~1-5s of a full Server Action refetch). INSERT
// builds an optimistic row from the payload + the cached tables snapshot
// (postgres_changes carries no joins) AND fires a deduped fallback refresh
// in case the server-side filter applied differently than our local mapping.
export function useOrderSync({
  branchId,
  setTables,
  setOrders,
  getTables,
  refreshOrders,
  refreshAll,
  onArchivedInvalidate,
  skipFirstSubscribedRefresh = false,
}: UseOrderSyncArgs): void {
  const refreshOrdersRef = useRef(refreshOrders);
  const refreshAllRef = useRef(refreshAll);
  const setTablesRef = useRef(setTables);
  const setOrdersRef = useRef(setOrders);
  const getTablesRef = useRef(getTables);
  const onArchivedInvalidateRef = useRef(onArchivedInvalidate);
  const lastSyncRef = useRef<number>(Date.now());
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    refreshOrdersRef.current = refreshOrders;
    refreshAllRef.current = refreshAll;
    setTablesRef.current = setTables;
    setOrdersRef.current = setOrders;
    getTablesRef.current = getTables;
    onArchivedInvalidateRef.current = onArchivedInvalidate;
  }, [
    refreshOrders,
    refreshAll,
    setTables,
    setOrders,
    getTables,
    onArchivedInvalidate,
  ]);

  useRealtimeChannel((supabase) => {
    const branchFilter = `branch_id=eq.${String(branchId)}`;
    return supabase
      .channel(`pos-branch-${String(branchId)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: branchFilter,
        },
        (payload) => {
          lastSyncRef.current = Date.now();
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const old = payload.old as { id?: unknown };
            const oldId =
              typeof old.id === "number" ? old.id : Number(old.id);
            if (!Number.isFinite(oldId)) {
              // Filter dropped the column (REPLICA IDENTITY safety net) —
              // fall back to a refetch so the list eventually converges.
              refreshOrdersRef.current();
              return;
            }
            setOrdersRef.current((prev) =>
              prev.filter((o) => o.id !== oldId),
            );
            return;
          }

          if (eventType === "UPDATE") {
            const updated = payload.new as Record<string, unknown> & {
              id?: unknown;
            };
            const newId =
              typeof updated.id === "number" ? updated.id : Number(updated.id);
            if (!Number.isFinite(newId)) {
              refreshOrdersRef.current();
              return;
            }

            // Provider holds ACTIVE orders only. A terminal-flip (paid /
            // completed / cancelled) means the row leaves the active list
            // and lands in the "Đã xử lý" sheet — remove from active state
            // and bump the archived invalidation token so an open sheet
            // can refetch its first page.
            const newStatus =
              typeof updated.status === "string" ? updated.status : null;
            const newPaymentStatus =
              typeof updated.payment_status === "string"
                ? updated.payment_status
                : null;
            const isTerminal =
              newPaymentStatus === "paid" ||
              newStatus === "completed" ||
              newStatus === "cancelled";

            if (isTerminal) {
              setOrdersRef.current((prev) =>
                prev.some((o) => o.id === newId)
                  ? prev.filter((o) => o.id !== newId)
                  : prev,
              );
              onArchivedInvalidateRef.current?.();
              return;
            }

            setOrdersRef.current((prev) => {
              const idx = prev.findIndex((o) => o.id === newId);
              if (idx < 0) {
                // Order not in the current snapshot — could be a fresh row
                // from another session that the local list hasn't fetched
                // yet. Defer to a refetch rather than synthesizing one.
                refreshOrdersRef.current();
                return prev;
              }
              const current = prev[idx];
              if (!current) return prev;
              const next = prev.slice();
              next[idx] = applyOrderUpdate(current, updated);
              return next;
            });
            return;
          }

          if (eventType === "INSERT") {
            const optimistic = buildOptimisticOrder(
              payload.new as Record<string, unknown>,
              getTablesRef.current(),
            );
            if (optimistic === null) {
              refreshOrdersRef.current();
              return;
            }
            setOrdersRef.current((prev) => {
              if (prev.some((o) => o.id === optimistic.id)) return prev;
              return [optimistic, ...prev];
            });
            // Deduped refresh as fallback: covers fields fetchSessionOrders
            // applies that the optimistic mapping cannot (e.g. session filter
            // when the row is from another terminal). The deduper coalesces
            // concurrent triggers into ≤2 round-trips.
            refreshOrdersRef.current();
            return;
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tables",
          filter: branchFilter,
        },
        (payload) => {
          lastSyncRef.current = Date.now();
          const updated = payload.new as Partial<BranchTable> & { id: number };
          setTablesRef.current((prev) => {
            const idx = prev.findIndex((t) => t.id === updated.id);
            if (idx < 0) return prev;
            const current = prev[idx];
            if (!current) return prev;
            const next = prev.slice();
            next[idx] = { ...current, ...updated };
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // The FIRST SUBSCRIBED is the initial mount subscription. When
        // the caller has already seeded state (e.g. from RSC prefetch),
        // skip this one refresh — it would duplicate work. Every
        // SUBSCRIBED after that is a genuine reconnect and must refresh
        // to catch events missed during disconnect.
        if (!initialSubscribeSeenRef.current) {
          initialSubscribeSeenRef.current = true;
          if (skipFirstSubscribedRefresh) return;
        }
        refreshAllRef.current();
      });
  }, [branchId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastSyncRef.current < STALE_POLL_MS) return;
      refreshAllRef.current();
    }, STALE_POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);
}
