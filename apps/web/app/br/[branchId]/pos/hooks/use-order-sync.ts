"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { BranchTable } from "../page";

const STALE_POLL_MS = 20_000;

/**
 * In-flight deduper with trailing follow-up.
 *
 * Guarantees eventual consistency (the LAST caller always produces a
 * fetch) while collapsing bursts of realtime events, SUBSCRIBED
 * reconnects, and stale-poll ticks into at most 2 fetches total
 * (current + one trailing). No artificial time delay — the window is
 * defined by the in-flight fetch itself.
 *
 * NOT used by the manual "Tải lại" button — that path calls the raw
 * refreshOrders dispatcher so the operator always sees an immediate
 * round-trip when they explicitly ask for it.
 */
function makeDeduper(fn: () => Promise<void>): () => void {
  let inflight: Promise<void> | null = null;
  let pending = false;
  const run = (): void => {
    if (inflight !== null) {
      pending = true;
      return;
    }
    inflight = fn().finally(() => {
      inflight = null;
      if (pending) {
        pending = false;
        run();
      }
    });
  };
  return run;
}

export interface UseOrderSyncArgs {
  branchId: number;
  setTables: React.Dispatch<React.SetStateAction<BranchTable[]>>;
  refreshOrders: () => Promise<void>;
  refreshAll: () => Promise<void>;
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

  // Dedupers for realtime / SUBSCRIBED / stale-poll paths. Lazy-init
  // so the closures bind to the stable refs above. Each deduper calls
  // `refreshXRef.current()` at invocation time, which always reflects
  // the latest callback from the parent provider.
  const dedupedRefreshOrdersRef = useRef<(() => void) | null>(null);
  const dedupedRefreshAllRef = useRef<(() => void) | null>(null);
  if (dedupedRefreshOrdersRef.current === null) {
    dedupedRefreshOrdersRef.current = makeDeduper(() =>
      refreshOrdersRef.current(),
    );
  }
  if (dedupedRefreshAllRef.current === null) {
    dedupedRefreshAllRef.current = makeDeduper(() => refreshAllRef.current());
  }

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
          dedupedRefreshOrdersRef.current?.();
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
        dedupedRefreshAllRef.current?.();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, setTables]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastSyncRef.current < STALE_POLL_MS) return;
      dedupedRefreshAllRef.current?.();
    }, STALE_POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);
}
