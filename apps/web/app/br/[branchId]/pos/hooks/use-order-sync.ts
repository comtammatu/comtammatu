"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { BranchTable } from "../page";

const STALE_POLL_MS = 20_000;

export interface UseOrderSyncArgs {
  branchId: number;
  setTables: React.Dispatch<React.SetStateAction<BranchTable[]>>;
  /**
   * Fire-and-forget refresh of the session orders list. MUST already
   * be deduped by the caller — this hook fires it on every realtime
   * `orders` postgres_changes event and would otherwise thrash.
   * Provided by PosDesktopProvider via _utils/make-deduper.
   */
  refreshOrders: () => void;
  /**
   * Fire-and-forget full refresh (orders + tables). Also caller-deduped.
   * Invoked on SUBSCRIBED-reconnect and the stale visibility poll.
   */
  refreshAll: () => void;
  /**
   * When true, the FIRST `SUBSCRIBED` callback (initial mount subscription)
   * does not fire a catch-up refresh — orders are already seeded by the
   * caller (e.g. via RSC prefetch). Later SUBSCRIBED events (genuine
   * reconnects) always refresh to catch missed events during disconnect.
   */
  skipFirstSubscribedRefresh?: boolean;
}

// Current transport: Supabase Realtime postgres_changes on `orders` + `tables`,
// branch-scoped via URL branchId. Interface is stable so a Phase-2 local-first
// swap can replace the implementation without touching callers.
export function useOrderSync({
  branchId,
  setTables,
  refreshOrders,
  refreshAll,
  skipFirstSubscribedRefresh = false,
}: UseOrderSyncArgs): void {
  const supabaseRef = useRef(createClient());
  const refreshOrdersRef = useRef(refreshOrders);
  const refreshAllRef = useRef(refreshAll);
  const lastSyncRef = useRef<number>(Date.now());
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    refreshOrdersRef.current = refreshOrders;
    refreshAllRef.current = refreshAll;
  }, [refreshOrders, refreshAll]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const branchFilter = `branch_id=eq.${String(branchId)}`;

    const channel = supabase
      .channel(`pos-branch-${String(branchId)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: branchFilter,
        },
        () => {
          lastSyncRef.current = Date.now();
          refreshOrdersRef.current();
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
          setTables((prev) => {
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
        // The FIRST SUBSCRIBED is the initial mount subscription. When the
        // caller has already seeded state (e.g. from RSC prefetch), skip
        // this one refresh — it would duplicate work. Every SUBSCRIBED
        // after that is a genuine reconnect and must refresh to catch
        // events missed during disconnect.
        if (!initialSubscribeSeenRef.current) {
          initialSubscribeSeenRef.current = true;
          if (skipFirstSubscribedRefresh) return;
        }
        refreshAllRef.current();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, setTables]);

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
