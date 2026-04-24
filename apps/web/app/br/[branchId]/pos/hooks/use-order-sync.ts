"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { BranchTable } from "../page";

const STALE_POLL_MS = 20_000;

export interface UseOrderSyncArgs {
  branchId: number;
  setTables: React.Dispatch<React.SetStateAction<BranchTable[]>>;
  refreshOrders: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

// Current transport: Supabase Realtime postgres_changes on `orders` + `tables`,
// branch-scoped via URL branchId. Interface is stable so a Phase-2 local-first
// swap can replace the implementation without touching callers.
export function useOrderSync({
  branchId,
  setTables,
  refreshOrders,
  refreshAll,
}: UseOrderSyncArgs): void {
  const supabaseRef = useRef(createClient());
  const refreshOrdersRef = useRef(refreshOrders);
  const refreshAllRef = useRef(refreshAll);
  const lastSyncRef = useRef<number>(Date.now());

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
          void refreshOrdersRef.current();
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
        // On (re)subscribe, catch any events missed during disconnect.
        if (status === "SUBSCRIBED") {
          void refreshAllRef.current();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, setTables]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastSyncRef.current < STALE_POLL_MS) return;
      void refreshAllRef.current();
    }, STALE_POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);
}
