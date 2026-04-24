"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActiveSession, BranchTable } from "../page";
import type { SessionOrder } from "../order-history";
import { fetchSessionOrders, fetchTablesForBranch } from "../actions";
import { CartStore } from "./cart-store";
import { useOrderSync } from "../hooks/use-order-sync";
import { makeDeduper } from "../_utils/make-deduper";
import type { OrderType } from "../types";

/* ─── Session context (stable) ─── */

type SessionContextValue = {
  branchId: number;
  session: ActiveSession;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function usePosSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("usePosSession must be used inside PosDesktopProvider");
  return ctx;
}

/* ─── Cart store context (stable reference, value via useSyncExternalStore) ─── */

const CartStoreContext = createContext<CartStore | null>(null);

export function usePosCartStore(): CartStore {
  const store = useContext(CartStoreContext);
  if (!store) throw new Error("usePosCartStore must be used inside PosDesktopProvider");
  return store;
}

/* ─── Order list / tables: split data vs dispatch ─── */

type OperationalData = {
  orders: SessionOrder[];
  tables: BranchTable[];
};

type OperationalDispatch = {
  /** Raw promise-returning full refresh (orders + tables). */
  refreshAll: () => Promise<void>;
  /** Raw promise-returning orders refresh. Used by the manual "Tải lại" button — always immediate. */
  refreshOrders: () => Promise<void>;
  /**
   * Deduped, fire-and-forget orders refresh. Bursts coalesce to at
   * most 2 network calls (current + trailing). Use this from:
   *   - post-mutation shell paths (submit, append, void, cancel, etc.)
   *   - realtime `orders` handlers
   *   - SUBSCRIBED-on-reconnect catch-up
   *   - stale-visibility polls
   */
  refreshOrdersDeduped: () => void;
  /** Deduped full refresh. Used by SUBSCRIBED catch-up + stale poll. */
  refreshAllDeduped: () => void;
  setTables: (tables: BranchTable[]) => void;
};

const OrdersContext = createContext<SessionOrder[] | null>(null);
const TablesContext = createContext<BranchTable[] | null>(null);
const OperationalDispatchContext = createContext<OperationalDispatch | null>(
  null,
);

export function usePosOperationalData(): OperationalData {
  const orders = usePosOrders();
  const tables = usePosTables();
  return useMemo(() => ({ orders, tables }), [orders, tables]);
}

export function usePosOrders(): SessionOrder[] {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("usePosOrders must be used inside PosDesktopProvider");
  return ctx;
}

export function usePosTables(): BranchTable[] {
  const ctx = useContext(TablesContext);
  if (!ctx) throw new Error("usePosTables must be used inside PosDesktopProvider");
  return ctx;
}

export function usePosOperationalDispatch(): OperationalDispatch {
  const ctx = useContext(OperationalDispatchContext);
  if (!ctx)
    throw new Error(
      "usePosOperationalDispatch must be used inside PosDesktopProvider",
    );
  return ctx;
}

/* ─── Provider ─── */

interface PosDesktopProviderProps {
  branchId: number;
  session: ActiveSession;
  initialTables: BranchTable[];
  initialOrderType: OrderType;
  /** RSC-prefetched orders. When seeded, skip mount-time client refetch. */
  initialOrders: SessionOrder[];
  /**
   * True when `initialOrders` is authoritative (RSC fetch succeeded).
   * Forwarded to `useOrderSync` so the first SUBSCRIBED callback can
   * skip its redundant catch-up refresh. Subsequent reconnects still
   * refresh — only the very first mount-time SUBSCRIBED is skipped.
   */
  initialOrdersSeeded: boolean;
  children: ReactNode;
}

export function PosDesktopProvider({
  branchId,
  session,
  initialTables,
  initialOrderType,
  initialOrders,
  initialOrdersSeeded,
  children,
}: PosDesktopProviderProps) {
  const [orders, setOrders] = useState<SessionOrder[]>(initialOrders);
  const [tables, setTables] = useState<BranchTable[]>(initialTables);

  const sessionValue = useMemo<SessionContextValue>(
    () => ({ branchId, session }),
    [branchId, session],
  );

  // Cart store — stable across renders
  const cartStoreRef = useRef<CartStore | null>(null);
  if (cartStoreRef.current === null) {
    cartStoreRef.current = new CartStore({ orderType: initialOrderType });
  }
  const cartStore = cartStoreRef.current;

  useEffect(() => {
    setTables(initialTables);
  }, [initialTables]);

  const loadOrders = useCallback(async () => {
    const result = await fetchSessionOrders(branchId, session.id);
    if (result.success && result.data) {
      setOrders(result.data as SessionOrder[]);
    }
  }, [branchId, session.id]);

  const refreshAll = useCallback(async () => {
    const [ordersResult, tablesResult] = await Promise.all([
      fetchSessionOrders(branchId, session.id),
      fetchTablesForBranch(branchId),
    ]);
    if (ordersResult.success && ordersResult.data) {
      setOrders(ordersResult.data as SessionOrder[]);
    }
    if (tablesResult.success && tablesResult.data) {
      setTables(tablesResult.data as BranchTable[]);
    }
  }, [branchId, session.id]);

  // Initial orders come from RSC seed (see `initialOrders` + `initialOrdersSeeded`
  // props). Skipping the client-side mount refetch eliminates one round-trip on
  // cold load; `useOrderSync`'s first SUBSCRIBED catch-up is also skipped when
  // the seed is authoritative so there is no duplicate fetch on subscribe.

  // Single deduper instance per (branchId, session.id) window — shared by
  // realtime / SUBSCRIBED / stale-poll / post-mutation shell paths so a
  // submit + simultaneous realtime event collapse to 1 fetch, not 2.
  // Dependencies mirror loadOrders / refreshAll so the deduper is
  // recreated when the underlying fetch closures change.
  const refreshOrdersDeduped = useMemo(
    () => makeDeduper(loadOrders),
    [loadOrders],
  );
  const refreshAllDeduped = useMemo(() => makeDeduper(refreshAll), [refreshAll]);

  useOrderSync({
    branchId,
    setTables,
    refreshOrders: refreshOrdersDeduped,
    refreshAll: refreshAllDeduped,
    skipFirstSubscribedRefresh: initialOrdersSeeded,
  });

  const dispatchValue = useMemo<OperationalDispatch>(
    () => ({
      refreshAll,
      refreshOrders: loadOrders,
      refreshOrdersDeduped,
      refreshAllDeduped,
      setTables,
    }),
    [refreshAll, loadOrders, refreshOrdersDeduped, refreshAllDeduped],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <CartStoreContext.Provider value={cartStore}>
        <OperationalDispatchContext.Provider value={dispatchValue}>
          <OrdersContext.Provider value={orders}>
            <TablesContext.Provider value={tables}>
              {children}
            </TablesContext.Provider>
          </OrdersContext.Provider>
        </OperationalDispatchContext.Provider>
      </CartStoreContext.Provider>
    </SessionContext.Provider>
  );
}
