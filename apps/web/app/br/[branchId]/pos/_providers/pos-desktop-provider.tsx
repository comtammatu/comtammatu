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
  refreshAll: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  setTables: (tables: BranchTable[]) => void;
};

const OperationalDataContext = createContext<OperationalData | null>(null);
const OperationalDispatchContext = createContext<OperationalDispatch | null>(
  null,
);

export function usePosOperationalData(): OperationalData {
  const ctx = useContext(OperationalDataContext);
  if (!ctx)
    throw new Error("usePosOperationalData must be used inside PosDesktopProvider");
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
  children: ReactNode;
}

export function PosDesktopProvider({
  branchId,
  session,
  initialTables,
  initialOrderType,
  children,
}: PosDesktopProviderProps) {
  const [orders, setOrders] = useState<SessionOrder[]>([]);
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

  // Initial orders load (once)
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadOrders();
  }, [loadOrders]);

  const dataValue = useMemo<OperationalData>(
    () => ({ orders, tables }),
    [orders, tables],
  );

  const dispatchValue = useMemo<OperationalDispatch>(
    () => ({
      refreshAll,
      refreshOrders: loadOrders,
      setTables,
    }),
    [refreshAll, loadOrders],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <CartStoreContext.Provider value={cartStore}>
        <OperationalDispatchContext.Provider value={dispatchValue}>
          <OperationalDataContext.Provider value={dataValue}>
            {children}
          </OperationalDataContext.Provider>
        </OperationalDispatchContext.Provider>
      </CartStoreContext.Provider>
    </SessionContext.Provider>
  );
}
