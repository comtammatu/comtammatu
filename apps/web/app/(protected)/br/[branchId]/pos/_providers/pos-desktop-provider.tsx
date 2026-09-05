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
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import {
  ReceiptText as IconReceipt,
  RefreshCw as IconRefresh,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { ACTIONS_VI, POS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { PosStatusPanel } from "../pos-status-panel";
import type { ActiveSession, BranchTable } from "../page";
import type { SessionOrder } from "../order-history";
import {
  fetchActiveOrders,
  fetchDailyLimitsForPos,
  fetchTablesForBranch,
} from "../actions";
import { CartStore } from "./cart-store";
import { useOrderSync } from "../_hooks/use-order-sync";
import { usePrintJobAlerts } from "../_hooks/use-print-job-alerts";
import {
  createDailyLimitStore,
  type DailyLimitStore,
} from "./daily-limit-store";
import type { MenuItemDailyLimit } from "../pos-menu-types";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { readDevicePref, writeDevicePref } from "@lib/device-prefs";
import {
  audioModeHasVoice,
  cycleAudioMode,
  getPosAudioModeKey,
  playOperationalAlert,
  resolveAudioMode,
  type OperationalAudioMode,
} from "@lib/operational-audio";
import { prefetchOperationalVoiceCatalog } from "@lib/operational-voice";
import type { OrderType } from "../types";

export type DailyLimitsMap = ReadonlyMap<number, MenuItemDailyLimit>;

type OrdersBootstrapState = "loading" | "ready" | "error";

// Matches the slim RPC RETURNS TABLE (PR-3) minus fields the client never
// reads — see MenuItemDailyLimit.
interface DailyLimitRow {
  menu_item_id: number;
  is_disabled: boolean;
  sold_today: number;
  manual_limit_quantity: number | null;
  stock_allowance_quantity: number | null;
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
  audioMode: OperationalAudioMode;
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
  registerDailyLimitHoldTokenGetter: (
    getTokens: () => readonly string[],
  ) => void;
};

const OrdersContext = createContext<SessionOrder[] | null>(null);
const TablesContext = createContext<BranchTable[] | null>(null);
const OperationalDispatchContext = createContext<OperationalDispatch | null>(
  null,
);

/**
 * External store cho daily-limit slice (seeded từ RSC `fetchMenuForPos`,
 * patch realtime via `useOrderSync` on `pos-branch-{id}`). `useDailyLimit(itemId)` subscribe
 * theo từng id qua `useSyncExternalStore` — chỉ MenuItemButton của món có
 * limit đổi mới re-render (vs context propagation invalidate cả 50-200 card
 * trên mỗi event realtime — Architect option b).
 */
const DailyLimitStoreContext = createContext<DailyLimitStore | null>(null);

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
   * Otherwise the provider fetches the first snapshot immediately and keeps
   * the POS behind an explicit loading/error boundary until it succeeds.
   */
  initialOrdersSeeded: boolean;
  /**
   * Seed map of `menu_item_id → MenuItemDailyLimit` derived from the
   * RSC `fetchMenuForPos` response. Mounts the live slice; subsequent
   * mutations arrive via `useOrderSync` on the idle POS channel. Items without a daily
   * limit row simply aren't keys in the map — semantic equivalent of
   * `daily_limit: null` per `pos-menu-types.ts`.
   */
  initialDailyLimits: DailyLimitsMap;
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
  children,
}: PosDesktopProviderProps) {
  const router = useRouter();
  const handleSessionClosed = useCallback(() => {
    toast.warning(messages.pos.sessionHeader.closedReload);
    router.refresh();
  }, [router]);
  const [orders, setOrders] = useState<SessionOrder[]>(initialOrders);
  const [ordersBootstrapState, setOrdersBootstrapState] =
    useState<OrdersBootstrapState>(initialOrdersSeeded ? "ready" : "loading");
  const ordersReadyRef = useRef(initialOrdersSeeded);
  const initialOrdersLoadStartedRef = useRef(initialOrdersSeeded);
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

  useEffect(() => {
    dailyLimitStore.setAll(initialDailyLimits);
  }, [initialDailyLimits, dailyLimitStore]);

  const [archivedToken, setArchivedToken] = useState(0);
  // Default OFF; the device preference loads after mount to avoid a
  // hydration mismatch. Without persistence the alert channel silently
  // resets to muted on every reload/PWA relaunch.
  const [audioMode, setAudioMode] = useState<OperationalAudioMode>("off");
  const audioModeKey = getPosAudioModeKey(branchId);
  useEffect(() => {
    setAudioMode(resolveAudioMode(readDevicePref(audioModeKey)));
  }, [audioModeKey]);
  const tableVoiceLabels = tables.map((table) => String(table.number)).join(",");
  useEffect(() => {
    if (!audioModeHasVoice(audioMode)) return;
    prefetchOperationalVoiceCatalog({
      surface: "pos",
      branchId,
      tableLabels: tableVoiceLabels
        ? tableVoiceLabels.split(",")
        : undefined,
    });
  }, [audioMode, branchId, tableVoiceLabels]);
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
    setAudioMode((current) => {
      const next = cycleAudioMode(current);
      playOperationalAlert({
        kind: "pos.self_order",
        mode: next,
        force: true,
        branchId,
      });
      writeDevicePref(audioModeKey, next);
      return next;
    });
  }, [audioModeKey, branchId]);
  const soundValue = useMemo<PosSoundContextValue>(
    () => ({ audioMode, toggleSound }),
    [audioMode, toggleSound],
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

  const markOrdersLoadFailure = useCallback(() => {
    if (!ordersReadyRef.current) {
      setOrdersBootstrapState("error");
    }
  }, []);

  const applyOrdersResult = useCallback(
    (result: Awaited<ReturnType<typeof fetchActiveOrders>>) => {
      if (!result.success || !Array.isArray(result.data)) {
        markOrdersLoadFailure();
        return;
      }

      ordersReadyRef.current = true;
      setOrders(result.data as SessionOrder[]);
      setOrdersBootstrapState("ready");
    },
    [markOrdersLoadFailure],
  );

  const loadOrders = useCallback(async () => {
    if (!ordersReadyRef.current) {
      setOrdersBootstrapState("loading");
    }

    try {
      applyOrdersResult(await fetchActiveOrders(branchId));
    } catch {
      markOrdersLoadFailure();
    }
  }, [applyOrdersResult, branchId, markOrdersLoadFailure]);

  useEffect(() => {
    if (initialOrdersLoadStartedRef.current) return;
    initialOrdersLoadStartedRef.current = true;
    void loadOrders();
  }, [loadOrders]);

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
        stock_allowance_quantity: row.stock_allowance_quantity,
        available_to_sell: row.available_to_sell,
      });
    }
    dailyLimitStore.setAll(next);
  }, [branchId, dailyLimitStore]);

  const refreshAll = useCallback(async () => {
    const [ordersResult, tablesResult] = await Promise.all([
      fetchActiveOrders(branchId).catch(() => null),
      fetchTablesForBranch(branchId).catch(() => null),
    ]);

    if (ordersResult) {
      applyOrdersResult(ordersResult);
    } else {
      markOrdersLoadFailure();
    }
    if (tablesResult?.success && tablesResult.data) {
      setTables(tablesResult.data as BranchTable[]);
    }
  }, [applyOrdersResult, branchId, markOrdersLoadFailure]);

  // The first order snapshot is either authoritative RSC data or the explicit
  // mount load above. Realtime skips only its first SUBSCRIBED catch-up so that
  // it does not duplicate either path; reconnects still refresh normally.

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

  const printJobAlerts = usePrintJobAlerts({ branchId, audioMode });

  useOrderSync({
    branchId,
    setTables,
    setOrders,
    getTables,
    getOrders,
    refreshOrders: refreshOrdersDeduped,
    refreshAll: refreshAllDeduped,
    onArchivedInvalidate: bumpArchivedToken,
    audioMode,
    skipFirstSubscribedRefresh: true,
    refreshLimits: refreshDailyLimitsDeduped,
    sessionId: session.id,
    onSessionClosed: handleSessionClosed,
    onPrintJobUpdate: printJobAlerts.handlePrintJobUpdate,
    onPrintReconnect: printJobAlerts.sweepRecentFailures,
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

  const content =
    ordersBootstrapState === "error" ? (
      <PosStatusPanel
        icon={<IconReceipt />}
        title={POS_VI.shellOrdersErrorTitle}
        description={POS_VI.shellOrdersErrorFallback}
        badge={{
          label: POS_VI.shellOrdersErrorBadge,
          icon: <IconAlertTriangle className="size-3.5" />,
          variant: "warning",
        }}
      >
        <Button type="button" size="touch" onClick={() => void loadOrders()}>
          <IconRefresh data-icon="inline-start" />
          {ACTIONS_VI.retry}
        </Button>
      </PosStatusPanel>
    ) : (
      // Render the POS shell immediately on cold-load (orders start empty and
      // hydrate within ~200ms via the bootstrap read below); the previous full
      // skeleton gate added a second visible loading layer after the RSC stream.
      children
    );

  return (
    <SessionContext.Provider value={sessionValue}>
      <PosSoundContext.Provider value={soundValue}>
        <CartStoreContext.Provider value={cartStore}>
          <OperationalDispatchContext.Provider value={dispatchValue}>
            <OrdersContext.Provider value={orders}>
              <TablesContext.Provider value={tables}>
                <DailyLimitStoreContext.Provider value={dailyLimitStore}>
                  <ArchivedInvalidationContext.Provider value={archivedToken}>
                    {content}
                  </ArchivedInvalidationContext.Provider>
                </DailyLimitStoreContext.Provider>
              </TablesContext.Provider>
            </OrdersContext.Provider>
          </OperationalDispatchContext.Provider>
        </CartStoreContext.Provider>
      </PosSoundContext.Provider>
    </SessionContext.Provider>
  );
}
