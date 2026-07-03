"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ActiveSession, BranchTable } from "../page";
import type { SessionOrder } from "../order-history";
import {
  fetchActiveOrders,
  fetchDailyLimitsForPos,
  fetchTablesForBranch,
} from "../actions";
import { CartStore } from "./cart-store";
import { useOrderSync } from "../_hooks/use-order-sync";
import { useDailyLimitSync } from "../_hooks/use-daily-limit-sync";
import { usePrintJobAlerts } from "../_hooks/use-print-job-alerts";
import {
  createDailyLimitStore,
  type DailyLimitStore,
} from "./daily-limit-store";
import {
  createIngredientCapStore,
  type IngredientCapStore,
} from "./ingredient-cap-store";
import type { MenuItemDailyLimit } from "../pos-menu-types";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { playAppSignal } from "@lib/audio-signal";
import { readDevicePref, writeDevicePref } from "@lib/device-prefs";
import type { OrderType } from "../types";

export type DailyLimitsMap = ReadonlyMap<number, MenuItemDailyLimit>;
export type IngredientCapsMap = ReadonlyMap<number, number | null>;

// Today's RPCs still return the full 11-field shape (PR-2 slims this
// server-side). The client only reads a subset — see MenuItemDailyLimit.
interface DailyLimitRow {
  menu_item_id: number;
  is_disabled: boolean;
  sold_today: number;
  manual_limit_quantity: number | null;
  available_to_sell: number | null;
}

/* ─── Session context (stable) ─── */

type SessionContextValue = {
  branchId: number;
  session: ActiveSession;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function usePosSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error("usePosSession must be used inside PosDesktopProvider");
  return ctx;
}

/* ─── Device-local POS sound setting ─── */

type PosSoundContextValue = {
  soundEnabled: boolean;
  toggleSound: () => void;
};

const PosSoundContext = createContext<PosSoundContextValue | null>(null);

export function usePosSound(): PosSoundContextValue {
  const ctx = useContext(PosSoundContext);
  if (!ctx)
    throw new Error("usePosSound must be used inside PosDesktopProvider");
  return ctx;
}

/* ─── Cart store context (stable reference, value via useSyncExternalStore) ─── */

const CartStoreContext = createContext<CartStore | null>(null);

export function usePosCartStore(): CartStore {
  const store = useContext(CartStoreContext);
  if (!store)
    throw new Error("usePosCartStore must be used inside PosDesktopProvider");
  return store;
}

/* ─── Order list / tables: split data vs dispatch ─── */

type OperationalDispatch = {
  /** Raw promise-returning full refresh (orders + tables). */
  refreshAll: () => Promise<void>;
  /** Raw promise-returning orders refresh. Used by the manual"Tải lại" button — always immediate. */
  refreshOrders: () => Promise<void>;
  /**
   * Deduped, fire-and-forget orders refresh. Bursts coalesce to at
   * most 2 network calls (current + trailing). Use this from:
   * - post-mutation shell paths (submit, append, void, cancel, etc.)
   * - realtime `orders` handlers
   * - SUBSCRIBED-on-reconnect catch-up
   * - stale-visibility polls
   */
  refreshOrdersDeduped: () => void;
  /** Deduped full refresh. Used by SUBSCRIBED catch-up + stale poll. */
  refreshAllDeduped: () => void;
  setTables: (tables: BranchTable[]) => void;
  /**
   * Registers a getter for this terminal's currently-live daily-limit hold
   * token(s), read at refetch time by `loadDailyLimits` so the RPC excludes
   * them server-side — a terminal's own reservation must not double-count
   * against itself (D064 §4). Called from `PosDesktopInner`, which owns the
   * tokens via `useDailyLimitHolds`. A getter (not a value) avoids
   * re-rendering the provider on every token rotation.
   */
  registerDailyLimitHoldTokenGetter: (getTokens: () => readonly string[]) => void;
};

const OrdersContext = createContext<SessionOrder[] | null>(null);
const TablesContext = createContext<BranchTable[] | null>(null);
const OperationalDispatchContext = createContext<OperationalDispatch | null>(
  null,
);

/**
 * External store cho daily-limit slice (seeded từ RSC `fetchMenuForPos`,
 * patch realtime qua `useDailyLimitSync`). `useDailyLimit(itemId)` subscribe
 * theo từng id qua `useSyncExternalStore` — chỉ MenuItemButton của món có
 * limit đổi mới re-render (vs context propagation invalidate cả 50-200 card
 * trên mỗi event realtime — Architect option b).
 */
const DailyLimitStoreContext = createContext<DailyLimitStore | null>(null);
const IngredientCapStoreContext = createContext<IngredientCapStore | null>(
  null,
);

// Monotonic counter that bumps every time an order flips into a terminal
// status (paid / completed / cancelled). The "Đã xử lý" sheet's pagination
// hook reads this token; when it changes while the sheet is open, the
// hook resets to page 1 + refetches. Token-based invalidation avoids
// pushing rows into a paginated cursor stream (which would create
// ordering hazards across page boundaries).
const ArchivedInvalidationContext = createContext<number>(0);

export function usePosOrders(): SessionOrder[] {
  const ctx = useContext(OrdersContext);
  if (!ctx)
    throw new Error("usePosOrders must be used inside PosDesktopProvider");
  return ctx;
}

export function usePosTables(): BranchTable[] {
  const ctx = useContext(TablesContext);
  if (!ctx)
    throw new Error("usePosTables must be used inside PosDesktopProvider");
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

export function usePosArchivedInvalidationToken(): number {
  return useContext(ArchivedInvalidationContext);
}

export function usePosDailyLimitStore(): DailyLimitStore {
  const ctx = useContext(DailyLimitStoreContext);
  if (!ctx)
    throw new Error("useDailyLimit must be used inside PosDesktopProvider");
  return ctx;
}

export function usePosIngredientCapStore(): IngredientCapStore {
  const ctx = useContext(IngredientCapStoreContext);
  if (!ctx)
    throw new Error("useIngredientCap must be used inside PosDesktopProvider");
  return ctx;
}

/**
 * Per-item daily-limit subscription. Re-renders the consumer ONLY when this
 * specific `menu_item_id`'s slice changes (sold_today / is_disabled / limit_
 * quantity). Backed by external store + `useSyncExternalStore` — bypasses
 * React context's "all consumers re-render on any value change" semantics.
 */
export function useDailyLimit(itemId: number): MenuItemDailyLimit | null {
  const store = usePosDailyLimitStore();
  const getSnapshot = useCallback(() => store.get(itemId), [store, itemId]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/**
 * Per-item ingredient-cap subscription. Caps are refreshed from the same
 * limits-only POS catch-up fetch as daily limits, so coupled dishes sharing
 * ingredients stop using the initial menu snapshot after a sale.
 */
export function useIngredientCap(itemId: number): number | null {
  const store = usePosIngredientCapStore();
  const getSnapshot = useCallback(() => store.get(itemId), [store, itemId]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
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
  /**
   * Seed map of `menu_item_id → MenuItemDailyLimit` derived from the
   * RSC `fetchMenuForPos` response. Mounts the live slice; subsequent
   * mutations arrive via `useDailyLimitSync`. Items without a daily
   * limit row simply aren't keys in the map — semantic equivalent of
   * `daily_limit: null` per `pos-menu-types.ts`.
   */
  initialDailyLimits: DailyLimitsMap;
  /**
   * Seed map of `menu_item_id -> ingredient max_sellable` from the RSC
   * `fetchMenuForPos` response. Missing keys and null values mean no cap.
   */
  initialIngredientCaps: IngredientCapsMap;
  children: ReactNode;
}

export function PosDesktopProvider({
  branchId,
  session,
  initialTables,
  initialOrderType,
  initialOrders,
  initialOrdersSeeded,
  initialDailyLimits,
  initialIngredientCaps,
  children,
}: PosDesktopProviderProps) {
  const [orders, setOrders] = useState<SessionOrder[]>(initialOrders);
  const [tables, setTables] = useState<BranchTable[]>(initialTables);
  // External store (not React state) — see daily-limit-store.ts. Lazy
  // init mirrors `cartStoreRef` below; same instance for the lifetime of
  // the provider, so `useSyncExternalStore` consumers' subscribe identity
  // is stable.
  const dailyLimitStoreRef = useRef<DailyLimitStore | null>(null);
  if (dailyLimitStoreRef.current === null) {
    dailyLimitStoreRef.current = createDailyLimitStore(initialDailyLimits);
  }
  const dailyLimitStore = dailyLimitStoreRef.current;
  const ingredientCapStoreRef = useRef<IngredientCapStore | null>(null);
  if (ingredientCapStoreRef.current === null) {
    ingredientCapStoreRef.current = createIngredientCapStore(
      initialIngredientCaps,
    );
  }
  const ingredientCapStore = ingredientCapStoreRef.current;
  const [archivedToken, setArchivedToken] = useState(0);
  // Default OFF; the device preference loads after mount to avoid a
  // hydration mismatch. Without persistence the alert channel silently
  // resets to muted on every reload/PWA relaunch.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundPrefKey = `pos:sound:${String(branchId)}`;
  useEffect(() => {
    if (readDevicePref(soundPrefKey) === "1") setSoundEnabled(true);
  }, [soundPrefKey]);
  const bumpArchivedToken = useCallback(() => {
    setArchivedToken((t) => t + 1);
  }, []);

  // Mirror tables state in a ref so realtime handlers (which run outside
  // React's render scope) can resolve `tables.number` for INSERT payloads
  // without re-creating the channel-subscribe effect on every tables change.
  const tablesRef = useRef<BranchTable[]>(initialTables);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);
  const getTables = useCallback(() => tablesRef.current, []);
  const ordersRef = useRef<SessionOrder[]>(initialOrders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
  const getOrders = useCallback(() => ordersRef.current, []);

  const sessionValue = useMemo<SessionContextValue>(
    () => ({ branchId, session }),
    [branchId, session],
  );
  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      if (next) playAppSignal("pos", true);
      writeDevicePref(soundPrefKey, next ? "1" : "0");
      return next;
    });
  }, [soundPrefKey]);
  const soundValue = useMemo<PosSoundContextValue>(
    () => ({ soundEnabled, toggleSound }),
    [soundEnabled, toggleSound],
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

  // Re-seed limits when the RSC snapshot rotates (router.refresh after a
  // manager toggles is_disabled, or after the page rerenders post-shift-
  // open). `setAll` skips notify when nothing changed (Object.is per slice)
  // so a no-op reseed doesn't churn subscribers.
  useEffect(() => {
    dailyLimitStore.setAll(initialDailyLimits);
  }, [initialDailyLimits, dailyLimitStore]);

  useEffect(() => {
    ingredientCapStore.setAll(initialIngredientCaps);
  }, [initialIngredientCaps, ingredientCapStore]);

  const loadOrders = useCallback(async () => {
    const result = await fetchActiveOrders(branchId);
    if (result.success && result.data) {
      setOrders(result.data as SessionOrder[]);
    }
  }, [branchId]);

  // Getter for this terminal's live hold token(s), registered by
  // `PosDesktopInner` via `registerDailyLimitHoldTokenGetter`. Called fresh
  // inside `loadDailyLimits` on every refetch so a token rotation needs no
  // callback / realtime-subscription recreation.
  const holdTokenGetterRef = useRef<(() => readonly string[]) | null>(null);
  const registerDailyLimitHoldTokenGetter = useCallback(
    (getTokens: () => readonly string[]): void => {
      holdTokenGetterRef.current = getTokens;
    },
    [],
  );

  const loadDailyLimits = useCallback(async () => {
    const liveTokens = holdTokenGetterRef.current?.() ?? [];
    const result = await fetchDailyLimitsForPos(
      branchId,
      liveTokens.length > 0 ? [...liveTokens] : undefined,
    );
    if (!result.success || !Array.isArray(result.data)) return;
    const next = new Map<number, MenuItemDailyLimit>();
    // Availability fields are absent from generated types until the migration
    // is applied to the type-source schema.
    for (const row of result.data as DailyLimitRow[]) {
      next.set(row.menu_item_id, {
        is_disabled: row.is_disabled,
        sold_today: row.sold_today,
        manual_limit_quantity: row.manual_limit_quantity,
        available_to_sell: row.available_to_sell,
      });
    }
    dailyLimitStore.setAll(next);

    const ingredientCaps = result.meta?.ingredientCaps;
    const nextCaps = new Map<number, number | null>();
    if (Array.isArray(ingredientCaps)) {
      for (const row of ingredientCaps as Array<{
        menu_item_id: number;
        max_sellable: number | null;
      }>) {
        nextCaps.set(row.menu_item_id, row.max_sellable);
      }
    }
    ingredientCapStore.setAll(nextCaps);
  }, [branchId, dailyLimitStore, ingredientCapStore]);

  const refreshAll = useCallback(async () => {
    const [ordersResult, tablesResult] = await Promise.all([
      fetchActiveOrders(branchId),
      fetchTablesForBranch(branchId),
    ]);
    if (ordersResult.success && ordersResult.data) {
      setOrders(ordersResult.data as SessionOrder[]);
    }
    if (tablesResult.success && tablesResult.data) {
      setTables(tablesResult.data as BranchTable[]);
    }
  }, [branchId]);

  // Initial orders come from RSC seed (see `initialOrders` + `initialOrdersSeeded`
  // props). Skipping the client-side mount refetch eliminates one round-trip on
  // cold load; `useOrderSync`'s first SUBSCRIBED catch-up is also skipped when
  // the seed is authoritative so there is no duplicate fetch on subscribe.

  // Single coalescer instance per (branchId, session.id) window — shared by
  // realtime / SUBSCRIBED / stale-poll / post-mutation shell paths so a
  // submit + simultaneous realtime event collapse to one short-delay fetch.
  // Dependencies mirror loadOrders / refreshAll so the coalescer is
  // recreated when the underlying fetch closures change.
  const refreshOrdersDeduped = useMemo(
    () =>
      makeRealtimeCoalescer(loadOrders, undefined, {
        metricName: "pos.orders.refresh",
      }),
    [loadOrders],
  );
  const refreshAllDeduped = useMemo(
    () =>
      makeRealtimeCoalescer(refreshAll, undefined, {
        metricName: "pos.all.refresh",
      }),
    [refreshAll],
  );
  const refreshDailyLimitsDeduped = useMemo(
    () =>
      makeRealtimeCoalescer(loadDailyLimits, undefined, {
        metricName: "pos.daily-limits.refresh",
      }),
    [loadDailyLimits],
  );

  useOrderSync({
    branchId,
    setTables,
    setOrders,
    getTables,
    getOrders,
    refreshOrders: refreshOrdersDeduped,
    refreshAll: refreshAllDeduped,
    onArchivedInvalidate: bumpArchivedToken,
    soundEnabled,
    skipFirstSubscribedRefresh: initialOrdersSeeded,
  });

  usePrintJobAlerts({ branchId, soundEnabled });

  // RSC always seeds the limits map (even if empty) — initial SUBSCRIBED
  // skips its catchup; reconnect SUBSCRIBED refetches via dedupe to fill
  // events missed during disconnect.
  useDailyLimitSync({
    branchId,
    refreshLimits: refreshDailyLimitsDeduped,
    skipFirstSubscribedRefresh: true,
  });

  const dispatchValue = useMemo<OperationalDispatch>(
    () => ({
      refreshAll,
      refreshOrders: loadOrders,
      refreshOrdersDeduped,
      refreshAllDeduped,
      setTables,
      registerDailyLimitHoldTokenGetter,
    }),
    [
      refreshAll,
      loadOrders,
      refreshOrdersDeduped,
      refreshAllDeduped,
      registerDailyLimitHoldTokenGetter,
    ],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <PosSoundContext.Provider value={soundValue}>
        <CartStoreContext.Provider value={cartStore}>
          <OperationalDispatchContext.Provider value={dispatchValue}>
            <OrdersContext.Provider value={orders}>
              <TablesContext.Provider value={tables}>
                <DailyLimitStoreContext.Provider value={dailyLimitStore}>
                  <IngredientCapStoreContext.Provider
                    value={ingredientCapStore}
                  >
                    <ArchivedInvalidationContext.Provider value={archivedToken}>
                      {children}
                    </ArchivedInvalidationContext.Provider>
                  </IngredientCapStoreContext.Provider>
                </DailyLimitStoreContext.Provider>
              </TablesContext.Provider>
            </OrdersContext.Provider>
          </OperationalDispatchContext.Provider>
        </CartStoreContext.Provider>
      </PosSoundContext.Provider>
    </SessionContext.Provider>
  );
}
