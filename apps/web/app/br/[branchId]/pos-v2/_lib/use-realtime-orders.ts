"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { fetchSessionOrders, fetchTablesForBranch } from "../../pos/actions";
import type { SessionOrder } from "../../pos/order-history";
import type { BranchTable } from "../../pos/page";

interface UseRealtimeOrdersArgs {
  branchId: number;
  sessionId: number;
  initialOrders: SessionOrder[];
  initialTables: BranchTable[];
}

interface UseRealtimeOrdersResult {
  orders: SessionOrder[];
  tables: BranchTable[];
  refresh: () => Promise<void>;
  refreshToken: number;
}

/**
 * Subscribes to Supabase realtime changes on `orders` + `tables` scoped to this
 * POS session / branch. Replaces the 4-second polling loop in the legacy POS —
 * we only refetch when Postgres actually emits a change event.
 *
 * We intentionally refetch through the server actions (rather than applying
 * payload.new directly) because the UI depends on joined columns like
 * `tables(number)` that realtime postgres_changes does not include.
 */
export function useRealtimeOrders({
  branchId,
  sessionId,
  initialOrders,
  initialTables,
}: UseRealtimeOrdersArgs): UseRealtimeOrdersResult {
  const [orders, setOrders] = useState<SessionOrder[]>(initialOrders);
  const [tables, setTables] = useState<BranchTable[]>(initialTables);
  const [refreshToken, setRefreshToken] = useState(0);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const [ordersResult, tablesResult] = await Promise.all([
        fetchSessionOrders(branchId, sessionId),
        fetchTablesForBranch(branchId),
      ]);
      let didRefresh = false;
      if (ordersResult.success && ordersResult.data) {
        setOrders(ordersResult.data as SessionOrder[]);
        didRefresh = true;
      }
      if (tablesResult.success && tablesResult.data) {
        setTables(tablesResult.data as BranchTable[]);
        didRefresh = true;
      }
      if (didRefresh) {
        setRefreshToken((t) => t + 1);
      }
    } finally {
      inflightRef.current = false;
    }
  }, [branchId, sessionId]);

  useEffect(() => {
    const supabase = createClient();

    const ordersChannel = supabase
      .channel(`pos-v2-orders-${String(sessionId)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `pos_session_id=eq.${String(sessionId)}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const tablesChannel = supabase
      .channel(`pos-v2-tables-${String(branchId)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tables",
          filter: `branch_id=eq.${String(branchId)}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(tablesChannel);
    };
  }, [branchId, sessionId, refresh]);

  return { orders, tables, refresh, refreshToken };
}
