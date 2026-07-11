"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { BellRing as IconBell } from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { POS_ERROR_CODES } from "./_utils/error-codes";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { PosTableGate } from "./pos-table-gate";
import { PosTakeawayGate } from "./pos-takeaway-gate";
import { ItemCustomizer } from "./item-customizer";
import { PosSessionTopBar } from "./pos-session-header";
import { MenuPane } from "./_components/menu-pane";
import { PosMobileActionBar } from "./_components/pos-mobile-action-bar";
import type { SubmitOrderOptions } from "./_components/cart-pane";
import { SplitSidebar } from "./_components/pos-sidebar-variants";
import { PosSidebarContent } from "./pos-sidebar-panel";
import { formatOrderTargetLabel } from "./_utils/order-display";
import {
  PosOrderTargetRow,
  type OrderTarget,
} from "./_components/pos-order-target-row";
import { SelfOrderApprovalSheet } from "./_components/self-order-approval-sheet";
import {
  fetchSelfOrderPosState,
  type SelfOrderPosState,
} from "./self-order-actions";
import { playAppSignal } from "@lib/audio-signal";
import { audioModeHasBeep, playOperationalAlert } from "@lib/operational-audio";

// Lazy-load these modals OFF the cash path, code-splitting their JS out of
// the initial POS bundle. Trims first-paint JS without affecting payment
// latency, PROVIDED the chunk is warm by the time it's needed — see the
// idle-prefetch effect below for BillReceipt/OrderDetailSheet.
//
// HotkeyOverlay: rare ?-key help.
// CloseSessionSheet: once per shift via F10.
// MultiOrderTablePicker: only when cashier taps an occupied table.
const HotkeyOverlay = dynamic(
  () =>
    import("./_components/hotkey-overlay").then((m) => ({
      default: m.HotkeyOverlay,
    })),
  { ssr: false },
);
const CloseSessionSheet = dynamic(
  () =>
    import("./close-session-sheet").then((m) => ({
      default: m.CloseSessionSheet,
    })),
  { ssr: false },
);
const MultiOrderTablePicker = dynamic(
  () =>
    import("./_components/multi-order-table-picker").then((m) => ({
      default: m.MultiOrderTablePicker,
    })),
  { ssr: false },
);
// Archived orders is a lookup-only tool (reprint / dispute / scroll-back),
// off the cash hot path. Lazy-loaded for the same reason as CloseSessionSheet.
const ArchivedOrdersSheet = dynamic(
  () =>
    import("./_components/archived-orders-sheet").then((m) => ({
      default: m.ArchivedOrdersSheet,
    })),
  { ssr: false },
);
// BillReceipt + OrderDetailSheet are the two heaviest eager sheets (bill
// pulls qrcode via payment-qr-code.tsx; order-detail pulls its full item/
// void/discount/transfer sub-component tree). Code-split like the modals
// above, but participate in HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN +
// HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK + POS-PAYMENT-REUSE-UNIQUE-SLOT, so a
// cold chunk-load at the moment the cashier opens either sheet is an
// unrecoverable cash-flow risk. The idle-prefetch effect below fetches both
// chunks shortly after mount so they are warm long before first use.
const loadBillReceipt = () =>
  import("./_components/bill/bill-receipt-sheet").then((m) => ({
    default: m.BillReceipt,
  }));
const loadOrderDetailSheet = () =>
  import("./order-detail-sheet").then((m) => ({
    default: m.OrderDetailSheet,
  }));
const BillReceipt = dynamic(loadBillReceipt, { ssr: false });
const OrderDetailSheet = dynamic(loadOrderDetailSheet, { ssr: false });
import { fetchActiveOrderForTable, editPendingOrderItem } from "./actions";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { usePosAppend } from "./_hooks/use-pos-append";
import { useDailyLimitHolds } from "./_hooks/use-daily-limit-holds";
import {
  formatAddToCartBlockMessage,
  useAddToCartGate,
} from "./_hooks/use-add-to-cart-gate";
import { useBillSurface } from "./_hooks/use-bill-surface";
import { useOrderDetailSurface } from "./_hooks/use-order-detail-surface";
import { submitPosOrderWithRetry } from "./_utils/submit-with-retry";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { BranchTable } from "./page";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import type { VietQrConfig } from "./payment-actions";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
  type SessionOrder,
} from "./order-history";
import type { OrderDetailData } from "./order-detail-sheet";
import {
  usePosOperationalDispatch,
  usePosOrders,
  usePosTables,
  usePosCartStore,
  usePosSession,
  usePosSound,
} from "./_providers/pos-desktop-provider";
import {
  useCartActions,
  useCartItemCount,
  useCartOrderType,
  useCartQuantity,
  useCartSnapshot,
} from "./_hooks/use-cart";
import { useActiveTable } from "./_hooks/use-active-table";
import { useAppendTarget } from "./_hooks/use-append-target";
import {
  deriveTableOrderVisualStates,
  isActiveUnpaidPosOrder,
} from "./_lib/table-order-visual-state";
import { makeCartKey, makeNotedCartKey } from "./_utils/cart-key";
import { messages } from "@lib/messages";

/* ─── Inner (consumes hooks) ─── */

export function PosDesktopInner({
  categories: initialCategories,
  canCloseShift,
  canConfirmCash,
  canSplitMerge,
  initialPaymentMethods,
  initialVietQrConfig,
  initialOpenOrderId,
}: {
  categories: MenuCategory[];
  canCloseShift: boolean;
  canConfirmCash: boolean;
  canSplitMerge: boolean;
  initialPaymentMethods: readonly PaymentMethod[];
  initialVietQrConfig: VietQrConfig | null;
  initialOpenOrderId?: number;
}) {
  const { branchId, session } = usePosSession();
  const orders = usePosOrders();
  const tables = usePosTables();
  const { audioMode } = usePosSound();
  const {
    refreshOrders,
    refreshOrdersDeduped,
    registerDailyLimitHoldTokenGetter,
  } = usePosOperationalDispatch();

  // Categories come straight from the RSC seed — no re-mapping per event.
  // MenuItemButton subscribes to the daily-limit slice via
  // `useDailyLimit(item.id)`, so only cards whose limit changed re-render.
  const categories: MenuCategory[] = initialCategories;
  const cartStore = usePosCartStore();
  const cartOrderType = useCartOrderType();
  const cartItemCount = useCartItemCount();
  const cartQuantity = useCartQuantity();
  const {
    addItem: addCartItem,
    clear: clearCart,
    replaceItems: replaceCartItems,
    setOrderType: setCartOrderType,
  } = useCartActions();
  const activeTable = useActiveTable();
  const appendMode = useAppendTarget();
  const appendTarget = appendMode.target;
  const clearAppendTarget = appendMode.clear;
  const startAppendTarget = appendMode.start;
  const selectedTableId = activeTable.tableId;
  const selectedTable = activeTable.table;
  const selectedTableAvailable = activeTable.isAvailable;
  const setActiveTable = activeTable.setTable;

  const router = useRouter();

  // Cross-tab realtime: when the session is closed from another tab/device,
  // the UPDATE payload lands here with `new.status='closed'`; refresh the
  // route so the page re-fetches the active session (SessionGate renders
  // when none is open).
  //
  // Defense-in-depth (rule REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK): the
  // status callback skips the first SUBSCRIBED (state already seeded from
  // RSC) and reloads on later reconnects to catch events missed offline.
  useRealtimeChannel(
    (supabase) => {
      let initialSubscribe = true;
      return supabase
        .channel(`pos-session-branch-${String(branchId)}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "pos_sessions",
            filter: `branch_id=eq.${String(branchId)}`,
          },
          (payload) => {
            const next = payload.new;
            if (
              next !== null &&
              typeof next === "object" &&
              "id" in next &&
              "status" in next &&
              (next as { id: number }).id === session.id &&
              (next as { status: string }).status === "closed"
            ) {
              toast.warning("Ca POS đã đóng — đang tải lại trang.");
              router.refresh();
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (initialSubscribe) {
              initialSubscribe = false;
              return;
            }
            // Reconnect — may have missed a close event mid-disconnect.
            router.refresh();
          }
        });
    },
    [branchId, session.id, router],
  );

  // Warm the BillReceipt/OrderDetailSheet chunks during browser idle time so
  // the code-split above never costs a spinner at payment time — by the time
  // the cashier taps a table or order, both chunks are already fetched.
  useEffect(() => {
    const prefetch = () => {
      void loadBillReceipt();
      void loadOrderDetailSheet();
    };
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(prefetch, { timeout: 2000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(prefetch, 1000);
    return () => clearTimeout(timer);
  }, []);

  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  // Tap-to-edit for an item already in the append draft. Mirrors editingCartItem
  // but targets the local appendDraftItems list instead of the cart store —
  // lets the cashier add a note (or change variant/qty) on a row that landed
  // in the draft via the fast no-variant tap path.
  const [editingAppendItem, setEditingAppendItem] = useState<CartItem | null>(
    null,
  );
  // Tap-to-edit for an item already SENT to the kitchen while
  // status='pending'. Stores order_item_id so onConfirm calls
  // editPendingOrderItem (no in-place cart-store mutation). seedCartItem only
  // pre-populates customizer state — never written to the cart store. The
  // server RPC re-validates status='pending'.
  const [editingSentItem, setEditingSentItem] = useState<{
    orderItemId: number;
    seedCartItem: CartItem;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [archivedSheetOpen, setArchivedSheetOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const closeCartDrawer = useCallback(() => setCartDrawerOpen(false), []);
  const {
    billOrderId,
    billIntent,
    billInitialOrder,
    billHeaderSeed,
    latestAwaitingPaymentOrderId,
    openBill,
    closeBill,
    setBillOrderId,
    setBillIntent,
    setBillInitialOrder,
    setPostSubmitPaymentOrderId,
  } = useBillSurface({ orders, closeCartDrawer });
  const {
    orderDetailId,
    orderDetailNumber,
    orderDetailSummary,
    orderDetailSeed,
    detailRefreshTick,
    openDetail,
    closeOrderDetail,
    bumpDetailRefresh,
    setOrderDetailId,
    setOrderDetailNumber,
    setOrderDetailSummary,
    setOrderDetailSeed,
  } = useOrderDetailSurface({ closeCartDrawer });
  const [takeawayDraftActive, setTakeawayDraftActive] = useState(false);
  const [appendDraftItems, setAppendDraftItems] = useState<CartItem[]>([]);
  const [appendSubmitting, setAppendSubmitting] = useState(false);
  const [hotkeyOpen, setHotkeyOpen] = useState(false);
  const [selfOrderPosState, setSelfOrderPosState] = useState<SelfOrderPosState>(
    {
      requests: [],
      paymentRequests: [],
    },
  );
  const [selectedSelfOrderRequestId, setSelectedSelfOrderRequestId] = useState<
    number | null
  >(null);
  const [selfOrderApprovalOpen, setSelfOrderApprovalOpen] = useState(false);
  const knownSelfOrderRequestIdsRef = useRef<Set<number> | null>(null);
  const knownSelfOrderPaymentRequestIdsRef = useRef<Set<number> | null>(null);
  const selfOrderLoadGenerationRef = useRef(0);
  // Multi-order-per-table: when the user taps an occupied table, show a
  // picker listing active orders + a "Tạo đơn mới" button. The picker is the
  // only path to start a 2nd order on the same physical table.
  //
  // Storing only the table id (not a snapshot of orders) keeps the picker
  // tied to live `orders` state — when realtime fires (another terminal
  // creates a 2nd order, or the chef bumps an order to served), the picker
  // re-derives instantly instead of showing a frozen list.
  const [pickerTableId, setPickerTableId] = useState<number | null>(null);
  // When the user explicitly chose to create a new order on an occupied table,
  // we record the table id here so the auto-clear effect doesn't reset it the
  // moment table.status becomes !=="available".
  const [allowOccupiedTableId, setAllowOccupiedTableId] = useState<
    number | null
  >(null);
  const isTouchLayout = useIsMobile(1280);

  const menuItemById = useMemo(() => {
    const map = new Map<number, MenuItem>();
    for (const category of categories) {
      for (const menuItem of category.menu_items) {
        map.set(menuItem.id, menuItem);
      }
    }
    return map;
  }, [categories]);

  const openCloseSession = useCallback(() => {
    setShowCloseSession(true);
  }, []);

  const refreshOperational = useCallback(async () => {
    // Deduped fire-and-forget: if realtime already fired a fetch for
    // the same mutation, this call coalesces instead of racing. Detail
    // sheet refresh-token fires independently so its own refetch kicks
    // in regardless of orders-list fetch timing.
    refreshOrdersDeduped();
    bumpDetailRefresh();
  }, [refreshOrdersDeduped, bumpDetailRefresh]);

  const refreshSelfOrderPosState = useCallback(async () => {
    const generation = selfOrderLoadGenerationRef.current + 1;
    selfOrderLoadGenerationRef.current = generation;
    const result = await fetchSelfOrderPosState(branchId).catch(() => null);
    if (generation !== selfOrderLoadGenerationRef.current || !result?.success) {
      return;
    }

    const nextState = result.data ?? { requests: [], paymentRequests: [] };
    const nextRequestIds = new Set(
      nextState.requests.map((request) => request.id),
    );
    const nextPaymentIds = new Set(
      nextState.paymentRequests.map((request) => request.id),
    );
    const knownRequestIds = knownSelfOrderRequestIdsRef.current;
    const knownPaymentIds = knownSelfOrderPaymentRequestIdsRef.current;
    // Distinct tones from the POS order ping so cashiers do not confuse
    // QR guest events with ordinary POS sync alerts.
    if (
      knownRequestIds !== null &&
      nextState.requests.some((request) => !knownRequestIds.has(request.id))
    ) {
      playOperationalAlert({ kind: "pos.self_order", mode: audioMode });
    }
    if (
      knownPaymentIds !== null &&
      nextState.paymentRequests.some(
        (request) => !knownPaymentIds.has(request.id),
      )
    ) {
      if (audioModeHasBeep(audioMode)) playAppSignal("pos-payment-call");
    }
    knownSelfOrderRequestIdsRef.current = nextRequestIds;
    knownSelfOrderPaymentRequestIdsRef.current = nextPaymentIds;
    setSelfOrderPosState(nextState);
  }, [audioMode, branchId]);

  useEffect(() => {
    void refreshSelfOrderPosState();
    const timer = window.setInterval(() => {
      void refreshSelfOrderPosState();
    }, 5_000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshSelfOrderPosState();
      }
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      selfOrderLoadGenerationRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshSelfOrderPosState]);

  const refreshSelfOrderWorkflow = useCallback(async () => {
    await Promise.all([refreshSelfOrderPosState(), refreshOperational()]);
  }, [refreshOperational, refreshSelfOrderPosState]);

  // Clear selected table if it becomes unavailable while in dine-in mode.
  // Skip the clear when the user explicitly opted into an occupied table
  // (multi-order-per-table flow) so their selection survives the status flip.
  useEffect(() => {
    if (
      cartOrderType === "dine_in" &&
      selectedTableId !== null &&
      selectedTable != null &&
      selectedTable.status !== "available" &&
      selectedTableId !== allowOccupiedTableId
    ) {
      setActiveTable(null);
    }
  }, [
    allowOccupiedTableId,
    cartOrderType,
    selectedTable,
    selectedTableId,
    setActiveTable,
  ]);

  // Drop the explicit-occupied flag once the user moves away from that table
  // (manual switch, post-submit reset, etc.). Keeps the flag tied to one
  // active selection at a time — never accidentally reused on a later tap.
  useEffect(() => {
    if (
      allowOccupiedTableId !== null &&
      selectedTableId !== allowOccupiedTableId
    ) {
      setAllowOccupiedTableId(null);
    }
  }, [allowOccupiedTableId, selectedTableId]);

  const isExplicitOccupied =
    selectedTableId !== null && selectedTableId === allowOccupiedTableId;
  const selectedTableUsable = selectedTableAvailable || isExplicitOccupied;

  const takeawayDraftReady =
    cartOrderType === "takeaway" && takeawayDraftActive;
  const orderContextReady = takeawayDraftReady || selectedTableUsable;
  const isAppendingToOrder = appendTarget != null;
  const menuContextReady = orderContextReady || isAppendingToOrder;
  const isTakeawayGateActive =
    !menuContextReady && cartOrderType === "takeaway";
  const selectedTableNumber = selectedTable?.number;
  const appendDraftQuantity = useMemo(
    () => appendDraftItems.reduce((sum, item) => sum + item.quantity, 0),
    [appendDraftItems],
  );
  const appendOrderSummary = useMemo(
    () =>
      appendTarget != null
        ? (orders.find((order) => order.id === appendTarget.orderId) ?? null)
        : null,
    [appendTarget, orders],
  );
  const appendTargetLabel = useMemo(
    () =>
      appendTarget != null
        ? formatOrderTargetLabel(appendTarget.orderNumber, appendOrderSummary)
        : null,
    [appendOrderSummary, appendTarget],
  );
  const currentOrderTarget = useMemo<OrderTarget | null>(() => {
    if (appendTarget != null && appendTargetLabel != null) {
      return { kind: "existing-order", label: appendTargetLabel };
    }

    if (takeawayDraftReady) {
      return {
        kind: "new-takeaway",
        label: messages.pos.desktop.newTakeawayTarget,
      };
    }

    if (selectedTableUsable && selectedTableNumber != null) {
      return {
        kind: "new-dine-in",
        label: messages.pos.desktop.newDineInTarget(selectedTableNumber),
      };
    }

    return null;
  }, [
    appendTarget,
    appendTargetLabel,
    selectedTableNumber,
    selectedTableUsable,
    takeawayDraftReady,
  ]);

  useEffect(() => {
    setAppendDraftItems([]);
    setEditingAppendItem(null);
  }, [appendTarget?.orderId]);

  // Count active orders per table — drives the "N đơn" badge on multi-order
  // tables and the picker's order list.
  const orderCountByTable = useMemo(() => {
    const map = new Map<number, number>();
    for (const order of orders) {
      if (isActiveUnpaidPosOrder(order, ACTIVE_POS_STATUSES)) {
        const tableId = order.table_id;
        if (tableId !== null) map.set(tableId, (map.get(tableId) ?? 0) + 1);
      }
    }
    return map;
  }, [orders]);
  const tableOrderVisualStateByTable = useMemo(
    () => deriveTableOrderVisualStates(orders, ACTIVE_POS_STATUSES),
    [orders],
  );
  const pendingSelfOrderRequestByTable = useMemo(
    () =>
      new Map(
        selfOrderPosState.requests.map((request) => [request.tableId, request]),
      ),
    [selfOrderPosState.requests],
  );
  const pendingSelfOrderTableIds = useMemo(
    () => new Set(pendingSelfOrderRequestByTable.keys()),
    [pendingSelfOrderRequestByTable],
  );
  const selfOrderTableNumberById = useMemo(
    () => new Map(tables.map((table) => [table.id, table.number])),
    [tables],
  );
  const selfOrderPaymentRequestByOrder = useMemo(
    () =>
      new Map(
        selfOrderPosState.paymentRequests.map((request) => [
          request.orderId,
          request.id,
        ]),
      ),
    [selfOrderPosState.paymentRequests],
  );
  useEffect(() => {
    if (
      selectedSelfOrderRequestId !== null &&
      !selfOrderPosState.requests.some(
        (request) => request.id === selectedSelfOrderRequestId,
      )
    ) {
      setSelectedSelfOrderRequestId(null);
    }
  }, [selectedSelfOrderRequestId, selfOrderPosState.requests]);

  // Live derivation for the multi-order table picker. Re-runs whenever
  // `orders` or `tables` updates (realtime, post-mutation, refetch) so the
  // dialog never shows stale data.
  const pickerTable = useMemo(
    () =>
      pickerTableId !== null
        ? (tables.find((t) => t.id === pickerTableId) ?? null)
        : null,
    [pickerTableId, tables],
  );
  const pickerOrders = useMemo(
    () =>
      pickerTableId !== null
        ? orders
            .filter(
              (o) =>
                o.table_id === pickerTableId &&
                isActiveUnpaidPosOrder(o, ACTIVE_POS_STATUSES),
            )
            .sort(compareOrdersByNextAction)
        : [],
    [pickerTableId, orders],
  );

  // Auto-close picker when the last active order on the table goes terminal
  // (paid / cancelled by another terminal mid-picker). Without this the user
  // sees an empty list with no orders to pick — keeping the dialog open is
  // worse UX than dropping back to the menu.
  useEffect(() => {
    if (pickerTableId !== null && pickerOrders.length === 0) {
      setPickerTableId(null);
    }
  }, [pickerTableId, pickerOrders.length]);

  const canSubmit =
    cartItemCount > 0 && (takeawayDraftReady || selectedTableUsable);
  const cartSnapshot = useCartSnapshot();
  const { getAddToCartBlock, dailyLimitDemandByMenuItem } = useAddToCartGate({
    cartItems: cartSnapshot.items,
    appendDraftItems,
  });

  const {
    getDailyLimitHoldToken,
    resetDailyLimitHoldToken,
    reserveDailyLimitSnapshot,
    releaseDailyLimitHoldToken,
  } = useDailyLimitHolds({
    branchId,
    cartItems: cartSnapshot.items,
    appendDraftItems,
    appendTarget,
  });

  // Register a live getter (not a snapshot) so the provider's daily-limit
  // refetch always reads this terminal's current cart/append hold tokens,
  // including after a rotation — see `registerDailyLimitHoldTokenGetter`.
  useEffect(() => {
    registerDailyLimitHoldTokenGetter(() => [
      getDailyLimitHoldToken("pos_cart"),
      getDailyLimitHoldToken("pos_append"),
    ]);
  }, [registerDailyLimitHoldTokenGetter, getDailyLimitHoldToken]);

  const focusOrderWorkflow = useCallback(
    (orderId: number, orderNumber?: string | null) => {
      setShowOrders(true);
      setOrderDetailId(orderId);
      setOrderDetailNumber(orderNumber ?? null);
      setCartDrawerOpen(false);
    },
    [],
  );

  const initialOpenOrderIdRef = useRef(initialOpenOrderId ?? null);
  useEffect(() => {
    const targetOrderId = initialOpenOrderIdRef.current;
    if (targetOrderId === null) return;
    initialOpenOrderIdRef.current = null;
    const order = orders.find((candidate) => candidate.id === targetOrderId);
    focusOrderWorkflow(targetOrderId, order?.order_number ?? null);
  }, [focusOrderWorkflow, orders]);

  const { performAppend } = usePosAppend({
    branchId,
    refreshOperational,
  });

  const addAppendDraftItem = useCallback((line: CartItem) => {
    setAppendDraftItems((currentItems) => {
      const existing = currentItems.find((item) => item.key === line.key);
      if (existing == null) {
        return [...currentItems, line];
      }

      return currentItems.map((item) =>
        item.key === line.key
          ? { ...item, quantity: item.quantity + line.quantity }
          : item,
      );
    });
    setShowOrders(false);
  }, []);

  const removeAppendDraftItem = useCallback((key: string) => {
    setAppendDraftItems((currentItems) =>
      currentItems.filter((item) => item.key !== key),
    );
  }, []);

  const handleAppendDraftItemEdit = useCallback(
    (cartItem: CartItem) => {
      const menuItem = menuItemById.get(cartItem.menu_item_id);
      if (!menuItem) {
        toast.error("Món này không còn trong thực đơn.");
        return;
      }
      setEditingCartItem(null);
      setEditingAppendItem(cartItem);
      setCustomizerItem(menuItem);
    },
    [menuItemById],
  );

  const cancelAppendWorkflow = useCallback(() => {
    if (appendTarget == null) return;

    const target = appendTarget;
    setAppendDraftItems([]);
    clearAppendTarget();
    setCustomizerItem(null);
    setEditingCartItem(null);
    setEditingAppendItem(null);
    setCartDrawerOpen(false);
    releaseDailyLimitHoldToken("pos_append");
    focusOrderWorkflow(target.orderId, target.orderNumber);
  }, [
    appendTarget,
    clearAppendTarget,
    focusOrderWorkflow,
    releaseDailyLimitHoldToken,
  ]);

  const handleSubmitAppendDraft = useCallback(() => {
    if (
      appendTarget == null ||
      appendDraftItems.length === 0 ||
      appendSubmitting
    ) {
      return;
    }

    const target = appendTarget;
    const items = appendDraftItems;
    setAppendSubmitting(true);
    void (async () => {
      const reserved = await reserveDailyLimitSnapshot(items, "pos_append");
      if (!reserved) return;

      await performAppend(target, items, getDailyLimitHoldToken("pos_append"), {
        onSuccess: () => {
          resetDailyLimitHoldToken("pos_append");
          setAppendDraftItems([]);
          clearAppendTarget();
          setCustomizerItem(null);
          setEditingCartItem(null);
          setEditingAppendItem(null);
          setCartDrawerOpen(false);
          focusOrderWorkflow(target.orderId, target.orderNumber);
        },
      });
    })().finally(() => setAppendSubmitting(false));
  }, [
    appendDraftItems,
    appendSubmitting,
    appendTarget,
    clearAppendTarget,
    focusOrderWorkflow,
    getDailyLimitHoldToken,
    performAppend,
    reserveDailyLimitSnapshot,
    resetDailyLimitHoldToken,
  ]);

  const handleTableSelect = useCallback(
    (table: BranchTable) => {
      const pendingSelfOrderRequest = pendingSelfOrderRequestByTable.get(
        table.id,
      );
      if (pendingSelfOrderRequest) {
        setSelectedSelfOrderRequestId(pendingSelfOrderRequest.id);
        setSelfOrderApprovalOpen(true);
        return;
      }

      if (table.status === "available") {
        setActiveTable(selectedTableId === table.id ? null : table.id);
        return;
      }

      if (table.status !== "occupied") {
        toast.message("Bàn này chưa sẵn sàng để nhận order.");
        return;
      }

      // Single active order — the overwhelming case — opens its detail
      // directly; the picker's "Tạo đơn mới" entry moved into the sheet's
      // "Thêm đơn cho bàn" menu item. The picker only earns its tap when
      // the table really holds 2+ orders.
      const activeOrders = orders.filter(
        (o) =>
          o.table_id === table.id &&
          isActiveUnpaidPosOrder(o, ACTIVE_POS_STATUSES),
      );

      if (activeOrders.length === 1) {
        const order = activeOrders[0];
        if (order) {
          focusOrderWorkflow(order.id, order.order_number);
          return;
        }
      }

      if (activeOrders.length === 0) {
        // Edge case: tables.status is occupied but no active order surfaces in
        // the current orders list (stale realtime, cross-session race). Fall
        // back to the single-fetch fallback path so the cashier still sees the
        // row instead of an empty picker.
        startTransition(async () => {
          const result = await fetchActiveOrderForTable(branchId, table.id);
          if (result.success && result.data) {
            const order = result.data.order as unknown as OrderDetailData;
            setOrderDetailSeed({
              order,
              canManage: result.data.canManageOrders,
            });
            focusOrderWorkflow(order.id, order.order_number);
            void refreshOperational();
            return;
          }
          toast.error(
            result.error ?? "Chưa tìm thấy đơn đang phục vụ của bàn này.",
          );
          void refreshOperational();
        });
        return;
      }

      setPickerTableId(table.id);
    },
    [
      branchId,
      focusOrderWorkflow,
      orders,
      pendingSelfOrderRequestByTable,
      refreshOperational,
      selectedTableId,
      setActiveTable,
      startTransition,
    ],
  );

  const handleClosePicker = useCallback(() => {
    setPickerTableId(null);
  }, []);

  const handleOpenOrderFromPicker = useCallback(
    (orderId: number, orderNumber: string) => {
      setPickerTableId(null);
      focusOrderWorkflow(orderId, orderNumber);
    },
    [focusOrderWorkflow],
  );

  const handlePayOrderFromPicker = useCallback((orderId: number) => {
    setPickerTableId(null);
    setCartDrawerOpen(false);
    setPostSubmitPaymentOrderId(null);
    setBillInitialOrder(null);
    setBillIntent("payment");
    setBillOrderId(orderId);
  }, []);

  const handleAppendOrderFromPicker = useCallback(
    (orderId: number, orderNumber: string) => {
      setPickerTableId(null);
      setCartDrawerOpen(false);
      startAppendTarget(orderId, orderNumber);
      setShowOrders(false);
      toast.message("Chạm món trên menu để thêm");
    },
    [startAppendTarget],
  );

  const handleCreateNewOnOccupied = useCallback(() => {
    if (pickerTableId === null) return;
    const tableId = pickerTableId;
    setPickerTableId(null);
    setAllowOccupiedTableId(tableId);
    setActiveTable(tableId);
    setCartDrawerOpen(false);
  }, [pickerTableId, setActiveTable]);

  const handleCreateOrderOnTable = useCallback(
    (tableId: number) => {
      setAllowOccupiedTableId(tableId);
      setActiveTable(tableId);
      setCartDrawerOpen(false);
    },
    [setActiveTable],
  );

  const handleCreateTakeawayOrder = useCallback(() => {
    setCartOrderType("takeaway");
    setActiveTable(null);
    setShowOrders(false);
    setCartDrawerOpen(false);
    setTakeawayDraftActive(true);
  }, [setActiveTable, setCartOrderType]);

  const handleOrderTypeChange = useCallback(
    (type: OrderType) => {
      if (
        type !== cartOrderType &&
        (cartItemCount > 0 || selectedTableId !== null)
      ) {
        return;
      }

      setCartOrderType(type);
      if (type === "takeaway") {
        setActiveTable(null);
      }
      setTakeawayDraftActive(false);
    },
    [
      cartItemCount,
      cartOrderType,
      selectedTableId,
      setActiveTable,
      setCartOrderType,
    ],
  );

  const handleSubmitOrder = useCallback(
    (options?: SubmitOrderOptions) => {
      if (!canSubmit) return;

      const isPrioritySubmit = options?.priority === true;
      startTransition(async () => {
        const cartSnapshot = cartStore.getSnapshot();
        const reserved = await reserveDailyLimitSnapshot(
          cartSnapshot.items,
          "pos_cart",
        );
        if (!reserved) return;

        const dailyLimitHoldToken = getDailyLimitHoldToken("pos_cart");
        const submittedOrderType = cartSnapshot.orderType;
        const result = await submitPosOrderWithRetry({
          branchId,
          sessionId: session.id,
          cartSnapshot,
          tableId: selectedTableId,
          isPriority: isPrioritySubmit,
          dailyLimitHoldToken,
        });

        if (result.success && result.data) {
          const orderId = result.data.order_id;
          const orderNumber = result.data.order_number;
          const priorityWarning = result.meta?.priorityWarning;
          const prioritySet = result.meta?.prioritySet === true;
          toast.success(
            `${prioritySet ? "Đã gửi bếp ưu tiên" : "Đã gửi bếp"} — #${orderNumber}`,
            {
              action: {
                label: "Thanh toán",
                onClick: () => {
                  setBillIntent("payment");
                  setBillOrderId(orderId);
                },
              },
            },
          );
          if (typeof priorityWarning === "string") {
            toast.warning(priorityWarning);
          }
          const discountWarning = result.meta?.discountWarning;
          if (typeof discountWarning === "string") {
            toast.warning(discountWarning);
          }

          resetDailyLimitHoldToken("pos_cart");
          clearCart();
          setTakeawayDraftActive(false);
          if (submittedOrderType === "takeaway") {
            setPostSubmitPaymentOrderId(null);
            setBillIntent("payment");
            setBillInitialOrder(null);
            setBillOrderId(orderId);
            setShowOrders(false);
            setCartDrawerOpen(false);
            setOrderDetailId(null);
            setOrderDetailNumber(null);
            setOrderDetailSeed(null);
            setOrderDetailSummary(null);
            setActiveTable(null);
            // Reset orderType to home (dine_in when tables exist, else keep
            // takeaway) → jump back to "Chọn bàn | Mang về", symmetric with dine_in.
            setCartOrderType(tables.length > 0 ? "dine_in" : "takeaway");
            void refreshOperational();
            return;
          }

          setPostSubmitPaymentOrderId(null);
          focusOrderWorkflow(orderId, orderNumber);
          setActiveTable(null);
          void refreshOperational();
        } else {
          // Stale session prop (RSC snapshot held the old session.id after
          // a close-then-reopen on another tab). Self-heal: refresh the
          // route so RSC re-fetches the currently open session, instead
          // of looping the cashier through "thử lại" forever.
          if (result.errorCode === POS_ERROR_CODES.SCOPE_SESSION_NOT_OPEN) {
            toast.error(result.error ?? "Ca POS đã đóng — đang tải lại trang.");
            router.refresh();
            return;
          }
          toast.error(result.error ?? "Không thể tạo đơn hàng");
        }
      });
    },
    [
      canSubmit,
      branchId,
      cartStore,
      clearCart,
      getDailyLimitHoldToken,
      selectedTableId,
      setActiveTable,
      setCartOrderType,
      session.id,
      tables,
      focusOrderWorkflow,
      reserveDailyLimitSnapshot,
      resetDailyLimitHoldToken,
      refreshOperational,
      router,
    ],
  );

  const handleItemTap = useCallback(
    (item: MenuItem) => {
      const hasVariants = item.menu_item_variants.length > 0;
      const hasModifiers = item.menu_item_modifiers.length > 0;
      const hasSides = item.menu_item_available_sides.length > 0;

      if (appendTarget) {
        if (appendSubmitting) {
          toast.message("Đang gửi món thêm, vui lòng chờ...");
          return;
        }
        if (hasVariants || hasModifiers || hasSides) {
          setEditingCartItem(null);
          setEditingAppendItem(null);
          setCustomizerItem(item);
        } else {
          const block = getAddToCartBlock({
            menuItemId: item.id,
            itemName: item.name,
            quantity: 1,
            sides: [],
          });
          if (block) {
            toast.warning(formatAddToCartBlockMessage(block));
            return;
          }
          const line: CartItem = {
            key: makeCartKey(item.id, undefined, [], []),
            menu_item_id: item.id,
            item_name: item.name,
            quantity: 1,
            unit_price: item.base_price,
            modifiers: [],
            sides: [],
          };
          addAppendDraftItem(line);
        }
        return;
      }

      if (hasVariants || hasModifiers || hasSides) {
        setEditingCartItem(null);
        setEditingAppendItem(null);
        setCustomizerItem(item);
      } else {
        const block = getAddToCartBlock({
          menuItemId: item.id,
          itemName: item.name,
          quantity: 1,
          sides: [],
        });
        if (block) {
          toast.warning(formatAddToCartBlockMessage(block));
          return;
        }
        setShowOrders(false);
        addCartItem(item);
      }
    },
    [
      addAppendDraftItem,
      addCartItem,
      appendSubmitting,
      appendTarget,
      getAddToCartBlock,
    ],
  );

  const handleCartItemCustomize = useCallback(
    (cartItem: CartItem) => {
      const menuItem = menuItemById.get(cartItem.menu_item_id);
      if (!menuItem) {
        toast.error("Món này không còn trong thực đơn.");
        return;
      }

      setEditingAppendItem(null);
      setEditingCartItem(cartItem);
      setCustomizerItem(menuItem);
    },
    [menuItemById],
  );

  // OrderDetailSheet → "Sửa món" tap. Look up the MenuItem in menuItemById
  // (item.menu_item_id may be gone if the menu changed/reloaded) and build
  // seedCartItem from the row snapshot so the customizer can pre-populate.
  // The server-side guard re-validates status='pending'; the UI gate is only
  // a UX hint.
  const handleStartEditSent = useCallback(
    (snapshot: OrderItemRowData) => {
      if (snapshot.menu_item_id == null) {
        toast.error("Thiếu dữ liệu món — tải lại đơn rồi thử lại.");
        return;
      }
      const menuItem = menuItemById.get(snapshot.menu_item_id);
      if (!menuItem) {
        toast.error("Món này không còn trong thực đơn.");
        return;
      }
      const seedCartItem: CartItem = {
        key: `edit-sent-${String(snapshot.id)}`,
        menu_item_id: snapshot.menu_item_id,
        item_name: snapshot.item_name,
        variant_id: snapshot.variant_id ?? undefined,
        variant_name: snapshot.variant_name ?? undefined,
        quantity: snapshot.quantity,
        unit_price: snapshot.unit_price,
        modifiers: snapshot.modifiers,
        sides: snapshot.sides,
        note: snapshot.note ?? undefined,
      };
      // Clear other editing modes — only one customizer flow active at a time.
      setEditingCartItem(null);
      setEditingAppendItem(null);
      setEditingSentItem({ orderItemId: snapshot.id, seedCartItem });
      setCustomizerItem(menuItem);
    },
    [menuItemById],
  );

  const handleCustomizerConfirm = useCallback(
    (
      item: MenuItem,
      variantId: number | undefined,
      variantName: string | undefined,
      unitPrice: number,
      modifiers: CartModifier[],
      sides: CartSide[],
      note: string | undefined,
      quantity: number,
      discountType: "pct" | "vnd" | undefined,
      discountValue: number | undefined,
      discountNote: string | undefined,
    ) => {
      const hasDiscount =
        discountType !== undefined && discountValue !== undefined;
      if (!editingSentItem) {
        const excludeKey = editingCartItem?.key ?? editingAppendItem?.key;
        const block = getAddToCartBlock(
          {
            menuItemId: item.id,
            itemName: item.name,
            quantity,
            sides,
          },
          excludeKey ? new Set([excludeKey]) : undefined,
        );
        if (block) {
          toast.warning(formatAddToCartBlockMessage(block));
          return;
        }
      }

      // edit-sent: call the server action — never mutate the cart store in
      // place. This branch goes BEFORE editingCartItem/editingAppendItem:
      // editingSentItem is only set when the parent calls handleStartEditSent.
      if (editingSentItem) {
        const orderItemId = editingSentItem.orderItemId;
        startTransition(async () => {
          const r = await editPendingOrderItem(orderItemId, {
            variantId: variantId ?? null,
            variantName: variantName ?? null,
            unitPrice,
            modifiers,
            sides,
            note: note ?? null,
            quantity,
          });
          if (r.success) {
            toast.success("Đã cập nhật món");
            if (r.data?.printWarning) {
              toast.warning(r.data.printWarning);
            } else if (r.data?.quantityPrintQueued) {
              toast.success("Đã in phiếu báo bếp", { duration: 2000 });
            } else if (r.data?.wasSentToKitchen) {
              toast.message("Phiếu bếp đã in trước đó — báo bếp cập nhật");
            }
            void refreshOperational();
            // closeCustomizerAndMaybeReopenDetail clears editing state +
            // reopens the order detail sheet from the pre-customize
            // snapshot so cashier sees the freshly-edited order.
            closeCustomizerAndMaybeReopenDetail();
          } else {
            toast.error(r.error ?? "Không thể sửa món.");
          }
        });
        return;
      }

      if (editingCartItem) {
        const hasNote = note !== undefined && note.length > 0;
        const baseKey = makeCartKey(item.id, variantId, modifiers, sides);
        const key =
          hasNote || hasDiscount ? makeNotedCartKey(baseKey) : baseKey;
        const updatedItem: CartItem = {
          key,
          menu_item_id: item.id,
          item_name: item.name,
          variant_id: variantId,
          variant_name: variantName,
          quantity,
          unit_price: unitPrice,
          modifiers,
          sides,
          note,
          discount_type: hasDiscount ? discountType : undefined,
          discount_value: hasDiscount ? discountValue : undefined,
          discount_note: hasDiscount ? discountNote : undefined,
        };
        const cartSnapshot = cartStore.getSnapshot();
        const hasCollision = cartSnapshot.items.some(
          (cartItem) =>
            cartItem.key === key && cartItem.key !== editingCartItem.key,
        );
        const nextItems =
          hasCollision && key !== editingCartItem.key
            ? cartSnapshot.items
                .filter((cartItem) => cartItem.key !== editingCartItem.key)
                .map((cartItem) =>
                  cartItem.key === key
                    ? {
                        ...cartItem,
                        quantity: cartItem.quantity + quantity,
                      }
                    : cartItem,
                )
            : cartSnapshot.items.map((cartItem) =>
                cartItem.key === editingCartItem.key ? updatedItem : cartItem,
              );

        replaceCartItems(nextItems);
        setEditingCartItem(null);
        setCustomizerItem(null);
        return;
      }

      if (editingAppendItem) {
        if (appendSubmitting) {
          toast.message("Đang gửi món thêm, vui lòng chờ...");
          return;
        }
        const hasNote = note !== undefined && note.length > 0;
        const baseKey = makeCartKey(item.id, variantId, modifiers, sides);
        const key =
          hasNote || hasDiscount ? makeNotedCartKey(baseKey) : baseKey;
        const updatedItem: CartItem = {
          key,
          menu_item_id: item.id,
          item_name: item.name,
          variant_id: variantId,
          variant_name: variantName,
          quantity,
          unit_price: unitPrice,
          modifiers,
          sides,
          note,
          discount_type: hasDiscount ? discountType : undefined,
          discount_value: hasDiscount ? discountValue : undefined,
          discount_note: hasDiscount ? discountNote : undefined,
        };
        setAppendDraftItems((currentItems) => {
          const hasCollision = currentItems.some(
            (it) => it.key === key && it.key !== editingAppendItem.key,
          );
          if (hasCollision && key !== editingAppendItem.key) {
            return currentItems
              .filter((it) => it.key !== editingAppendItem.key)
              .map((it) =>
                it.key === key
                  ? { ...it, quantity: it.quantity + quantity }
                  : it,
              );
          }
          return currentItems.map((it) =>
            it.key === editingAppendItem.key ? updatedItem : it,
          );
        });
        setEditingAppendItem(null);
        setCustomizerItem(null);
        return;
      }

      if (appendTarget) {
        if (appendSubmitting) {
          toast.message("Đang gửi món thêm, vui lòng chờ...");
          return;
        }
        const hasNote = note !== undefined && note.length > 0;
        const baseKey = makeCartKey(item.id, variantId, modifiers, sides);
        const key =
          hasNote || hasDiscount ? makeNotedCartKey(baseKey) : baseKey;
        const line: CartItem = {
          key,
          menu_item_id: item.id,
          item_name: item.name,
          variant_id: variantId,
          variant_name: variantName,
          quantity,
          unit_price: unitPrice,
          modifiers,
          sides,
          note,
          discount_type: hasDiscount ? discountType : undefined,
          discount_value: hasDiscount ? discountValue : undefined,
          discount_note: hasDiscount ? discountNote : undefined,
        };
        addAppendDraftItem(line);
        setCustomizerItem(null);
        return;
      }
      setShowOrders(false);
      addCartItem(item, {
        variantId,
        variantName,
        unitPrice,
        modifiers,
        sides,
        note,
        quantity,
        discountType: hasDiscount ? discountType : undefined,
        discountValue: hasDiscount ? discountValue : undefined,
        discountNote: hasDiscount ? discountNote : undefined,
      });
      setCustomizerItem(null);
    },
    [
      addCartItem,
      addAppendDraftItem,
      appendSubmitting,
      appendTarget,
      cartStore,
      editingAppendItem,
      editingCartItem,
      editingSentItem,
      getAddToCartBlock,
      refreshOperational,
      replaceCartItems,
    ],
  );

  // POS-DETAIL-REOPEN-AFTER-CUSTOMIZER: when cashier taps "Sửa món" inside
  // the order detail sheet, the detail closes (avoid mobile sheet stacking
  // / focus-trap fight) and the customizer takes over. Without this ref,
  // dismissing the customizer drops cashier to the menu — they have to
  // navigate back to the order. Snapshot the detail context here so the
  // customizer close path can restore it.
  const pendingDetailReopenRef = useRef<{
    id: number;
    orderNumber: string | null;
    summary: SessionOrder | null;
  } | null>(null);

  const closeCustomizerAndMaybeReopenDetail = useCallback(() => {
    setCustomizerItem(null);
    setEditingCartItem(null);
    setEditingAppendItem(null);
    setEditingSentItem(null);
    const pending = pendingDetailReopenRef.current;
    if (pending !== null) {
      pendingDetailReopenRef.current = null;
      // Inline the openDetail body (rather than calling openDetail) to
      // keep this callback stable with no useCallback dep on a hook
      // declared later in the file. The detail sheet refetches on its
      // own when seed=null, picking up the freshly-edited unit_price /
      // subtotal from the server.
      setCartDrawerOpen(false);
      setOrderDetailSeed(null);
      setOrderDetailSummary(pending.summary);
      setOrderDetailId(pending.id);
      setOrderDetailNumber(pending.orderNumber);
    }
  }, []);

  // Gate operational shortcuts (F9/F10/F2/F4) while any sheet/modal is open so
  // they can't fire under or stack on top of an open surface. `?` is special:
  // it must still toggle the help overlay CLOSED while the overlay itself is the
  // only thing open, so it ignores hotkeyOpen but is still blocked under real sheets.
  const anyModalOpenExceptHotkey =
    customizerItem !== null ||
    billOrderId !== null ||
    orderDetailId !== null ||
    pickerTableId !== null ||
    archivedSheetOpen ||
    showCloseSession;
  const anyModalOpen = anyModalOpenExceptHotkey || hotkeyOpen;

  useKeyboardShortcut(
    [
      {
        key: "F10",
        preventDefault: true,
        handler: canCloseShift ? openCloseSession : () => {},
      },
      {
        key: "F9",
        preventDefault: true,
        handler: () => {
          if (latestAwaitingPaymentOrderId !== null) {
            openBill(latestAwaitingPaymentOrderId);
          } else {
            toast.message("Không có đơn chờ thanh toán");
          }
        },
      },
      {
        key: "F2",
        preventDefault: true,
        handler: () => {
          handleOrderTypeChange(
            cartOrderType === "takeaway" ? "dine_in" : "takeaway",
          );
        },
      },
      {
        key: "F4",
        preventDefault: true,
        handler: () => {
          const el = document.getElementById("pos-menu-search");
          if (el instanceof HTMLInputElement) el.focus();
        },
      },
    ],
    !anyModalOpen,
  );

  useKeyboardShortcut(
    [
      {
        key: "?",
        shift: true,
        handler: () => setHotkeyOpen((v) => !v),
      },
    ],
    !anyModalOpenExceptHotkey,
  );

  const handleReturnToTables = useCallback(() => {
    setShowOrders(false);
    setCartDrawerOpen(false);
    setActiveTable(null);
  }, [setActiveTable]);

  // Memo so memo'd children (SplitSidebar / PosSidebarContent)
  // see the same props identity across realtime ticks; without this, the
  // surrounding `usePosOrders` / cart subscriptions trigger a fresh object
  // every render → all sidebars re-render even when nothing they read changed.
  const handleOpenArchivedSheet = useCallback(() => {
    setArchivedSheetOpen(true);
  }, []);

  const sidebarContentProps = useMemo(
    () => ({
      showOrders,
      canSubmit,
      isPending,
      appendDraft: {
        target:
          appendTarget != null && appendTargetLabel != null
            ? { ...appendTarget, targetLabel: appendTargetLabel }
            : null,
        items: appendDraftItems,
        isSubmitting: appendSubmitting,
        onSubmit: handleSubmitAppendDraft,
        onCancel: cancelAppendWorkflow,
        onRemoveItem: removeAppendDraftItem,
        onEditItem: handleAppendDraftItemEdit,
      },
      onSubmitOrder: handleSubmitOrder,
      onOrderTypeChange: handleOrderTypeChange,
      onCustomizeItem: handleCartItemCustomize,
      onViewBill: openBill,
      onViewDetail: openDetail,
      onOpenArchivedSheet: handleOpenArchivedSheet,
      onReturnToTables: handleReturnToTables,
      hideTakeawayOrders: isTakeawayGateActive,
    }),
    [
      showOrders,
      canSubmit,
      isPending,
      appendTarget,
      appendTargetLabel,
      appendDraftItems,
      appendSubmitting,
      handleSubmitAppendDraft,
      cancelAppendWorkflow,
      removeAppendDraftItem,
      handleAppendDraftItemEdit,
      handleSubmitOrder,
      handleOrderTypeChange,
      handleCartItemCustomize,
      openBill,
      openDetail,
      handleOpenArchivedSheet,
      handleReturnToTables,
      isTakeawayGateActive,
    ],
  );

  const serviceModeSelector = (
    <ToggleGroup
      type="single"
      value={cartOrderType}
      variant="outline"
      size="touch"
      spacing={0}
      className="grid w-full grid-cols-2 rounded-md border bg-muted/40 p-1"
      aria-label={messages.pos.desktop.serviceModeAria}
      onValueChange={(value) => {
        if (value === "dine_in" || value === "takeaway") {
          handleOrderTypeChange(value);
        }
      }}
    >
      <ToggleGroupItem
        value="dine_in"
        className="w-full min-w-0 justify-center text-sm font-semibold"
        disabled={cartItemCount > 0 && cartOrderType !== "dine_in"}
      >
        {messages.pos.desktop.dineIn}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="takeaway"
        className="w-full min-w-0 justify-center text-sm font-semibold"
        disabled={cartItemCount > 0 && cartOrderType !== "takeaway"}
      >
        {messages.pos.desktop.takeaway}
      </ToggleGroupItem>
    </ToggleGroup>
  );

  // Back-to-main handler: dine_in → table gate; takeaway draft → takeaway gate.
  // Wired to the mobile header back arrow, kept out of the bottom action bar so
  // it stays in reach.
  const handleSwitchTableMode = useCallback(() => {
    if (cartItemCount > 0) {
      toast.message("Giỏ đang có món — xoá giỏ rồi mới đổi ngữ cảnh.");
      setShowOrders(false);
      setCartDrawerOpen(true);
      return;
    }
    setShowOrders(false);
    setCartDrawerOpen(false);
    if (cartOrderType === "takeaway") {
      setTakeawayDraftActive(false);
      return;
    }
    setActiveTable(null);
  }, [cartItemCount, cartOrderType, setActiveTable]);

  const orderTargetLabel = currentOrderTarget?.label ?? null;
  const orderTargetRow =
    menuContextReady &&
    orderTargetLabel != null &&
    currentOrderTarget != null ? (
      <PosOrderTargetRow
        target={currentOrderTarget}
        appendDraftQuantity={appendDraftQuantity}
        onCancel={cancelAppendWorkflow}
        onSwitch={handleSwitchTableMode}
      />
    ) : null;

  const mobileHeaderContextLabel = menuContextReady
    ? (orderTargetLabel ?? undefined)
    : undefined;

  const mobileSidebarDrawer = isTouchLayout ? (
    <Drawer
      open={cartDrawerOpen}
      onOpenChange={setCartDrawerOpen}
      shouldScaleBackground={false}
    >
      <DrawerContent
        showHandle
        className="h-dvh max-h-dvh p-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh before:inset-0 before:rounded-none before:border-0 before:bg-background sm:h-5/6 sm:p-2 sm:before:inset-2 sm:before:rounded-lg sm:before:border sm:before:bg-popover"
      >
        <DrawerTitle className="sr-only">
          {appendTarget != null
            ? `${messages.pos.desktop.pendingAppendTitle} ${
                orderTargetLabel ?? ""
              }`.trim()
            : showOrders
              ? "Đơn trong ca"
              : messages.pos.desktop.pendingNewTitle}
        </DrawerTitle>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <PosSidebarContent
            {...sidebarContentProps}
            onClosePane={() => setCartDrawerOpen(false)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  ) : null;

  // POS stays touch-first through tablet widths. The desktop split pane starts
  // at xl so tablet portrait/landscape keeps the drawer + sticky CTA workflow.
  const sidebars = isTouchLayout ? null : (
    <SplitSidebar
      canCloseShift={canCloseShift}
      onShowCloseSession={openCloseSession}
      isContextGate={!menuContextReady}
      sidebarContentProps={sidebarContentProps}
    />
  );

  return (
    <>
      <div className="xl:hidden">
        <PosSessionTopBar
          canCloseShift={canCloseShift}
          onShowCloseSession={openCloseSession}
          contextLabel={mobileHeaderContextLabel}
          onBack={
            isAppendingToOrder
              ? cancelAppendWorkflow
              : orderContextReady
                ? handleSwitchTableMode
                : undefined
          }
        />
      </div>

      {!menuContextReady ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {cartOrderType === "takeaway" ? (
              <PosTakeawayGate
                orders={orders}
                onCreateNew={handleCreateTakeawayOrder}
                onViewDetail={openDetail}
                headerAction={serviceModeSelector}
                className="min-h-0 flex-1"
              />
            ) : (
              <PosTableGate
                tables={tables}
                selectedTableId={selectedTableId}
                onTableSelect={handleTableSelect}
                orderCountByTable={orderCountByTable}
                tableOrderVisualStateByTable={tableOrderVisualStateByTable}
                pendingSelfOrderTableIds={pendingSelfOrderTableIds}
                headerAction={serviceModeSelector}
                className="min-h-0 flex-1"
              />
            )}
          </div>
          {sidebars}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {orderTargetRow}
            <MenuPane
              categories={categories}
              dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
              onItemTap={handleItemTap}
            />
          </div>
          {sidebars}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="touch"
        className="fixed right-3 bottom-20 z-40 lg:bottom-4"
        disabled={selfOrderPosState.requests.length === 0}
        onClick={() => {
          setSelectedSelfOrderRequestId(null);
          setSelfOrderApprovalOpen(true);
        }}
      >
        <IconBell data-icon="inline-start" />
        <span>{SELF_ORDER_VI.staffApprove}</span>
        {selfOrderPosState.requests.length > 0 ? (
          <Badge variant="warning">
            {formatCount(selfOrderPosState.requests.length)}
          </Badge>
        ) : null}
      </Button>

      <PosMobileActionBar
        isTouchLayout={isTouchLayout}
        isAppendingToOrder={isAppendingToOrder}
        menuContextReady={menuContextReady}
        cartQuantity={cartQuantity}
        appendDraftQuantity={appendDraftQuantity}
        ordersCount={orders.length}
        canSubmitNewOrder={canSubmit}
        isSubmittingNewOrder={isPending}
        canSubmitAppendDraft={appendDraftQuantity > 0 && !appendSubmitting}
        isSubmittingAppendDraft={appendSubmitting}
        onOpenOrdersDrawer={() => {
          setShowOrders(true);
          void refreshOrders();
          setCartDrawerOpen(true);
        }}
        onOpenCartDrawer={() => {
          setShowOrders(false);
          setCartDrawerOpen(true);
        }}
        onOpenAppendDrawer={() => {
          setShowOrders(false);
          setCartDrawerOpen(true);
        }}
        onSubmitNewOrder={() => handleSubmitOrder()}
        onSubmitAppendDraft={handleSubmitAppendDraft}
        onCancelAppend={cancelAppendWorkflow}
      />
      <SelfOrderApprovalSheet
        open={selfOrderApprovalOpen}
        requests={selfOrderPosState.requests}
        focusedRequestId={selectedSelfOrderRequestId}
        tableNumberById={selfOrderTableNumberById}
        orders={orders}
        onOpenChange={(open) => {
          setSelfOrderApprovalOpen(open);
          if (!open) setSelectedSelfOrderRequestId(null);
        }}
        onUpdated={refreshSelfOrderWorkflow}
      />
      {mobileSidebarDrawer}

      <ItemCustomizer
        item={customizerItem}
        onClose={closeCustomizerAndMaybeReopenDetail}
        onConfirm={handleCustomizerConfirm}
        mode={
          editingSentItem
            ? "edit-sent"
            : editingCartItem || editingAppendItem
              ? "edit"
              : appendTarget
                ? "append"
                : "new"
        }
        appendOrderLabel={appendTarget?.orderNumber ?? null}
        initialCartItem={
          editingSentItem?.seedCartItem ?? editingCartItem ?? editingAppendItem
        }
      />

      <OrderDetailSheet
        branchId={branchId}
        orderId={orderDetailId}
        orderNumber={orderDetailNumber}
        refreshToken={detailRefreshTick}
        initialOrder={orderDetailSeed?.order ?? null}
        initialCanManage={orderDetailSeed?.canManage ?? false}
        initialSummary={orderDetailSummary}
        onCreateOrderOnTable={handleCreateOrderOnTable}
        onClose={closeOrderDetail}
        onOpenBill={(id, seed) => {
          closeOrderDetail();
          openBill(
            id,
            seed.payment_status === "paid" ||
              seed.status === "completed" ||
              seed.status === "cancelled"
              ? "receipt"
              : "payment",
            seed,
          );
        }}
        onStartAppend={(oid, onum) => {
          closeOrderDetail();
          setCartDrawerOpen(false);
          startAppendTarget(oid, onum);
          setShowOrders(false);
          toast.message("Chạm món trên menu để thêm");
        }}
        onStartEditSent={(snapshot) => {
          // Close the detail before opening the customizer — avoids stacking
          // two sheets on mobile (focus-trap fight). Snapshot the detail context
          // first so closeCustomizerAndMaybeReopenDetail can restore it
          // after the customizer dismisses (POS-DETAIL-REOPEN-AFTER-
          // CUSTOMIZER).
          if (orderDetailId !== null) {
            pendingDetailReopenRef.current = {
              id: orderDetailId,
              orderNumber: orderDetailNumber,
              summary: orderDetailSummary,
            };
          }
          closeOrderDetail();
          handleStartEditSent(snapshot);
        }}
        onReorderToCart={(items, skippedCount, priceChangedCount) => {
          replaceCartItems(items);
          setShowOrders(false);
          if (skippedCount > 0) {
            toast.message(
              `Bỏ qua ${String(skippedCount)} món đã rời thực đơn.`,
            );
          } else {
            toast.success("Đã sao chép vào giỏ");
          }
          if (priceChangedCount > 0) {
            toast.warning(
              `${String(priceChangedCount)} món đã đổi giá kể từ đơn cũ — kiểm tra trước khi gửi bếp.`,
            );
          }
        }}
        tables={tables}
        orderCountByTable={orderCountByTable}
        canSplitMerge={canSplitMerge}
        onOrderUpdated={() => void refreshOperational()}
      />

      <CloseSessionSheet
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      <ArchivedOrdersSheet
        branchId={branchId}
        sessionId={session.id}
        open={archivedSheetOpen}
        onOpenChange={setArchivedSheetOpen}
        onViewBill={(id) => {
          // Reprint flow: archived rows always open in receipt-only mode.
          // Close the sheet first so we don't stack Drawer over Drawer on
          // mobile (focus stack gets bumpy at the bottom-sheet boundary).
          setArchivedSheetOpen(false);
          openBill(id, "receipt");
        }}
      />

      <BillReceipt
        branchId={branchId}
        orderId={billOrderId}
        intent={billIntent}
        initialOrder={billInitialOrder}
        canConfirmCash={canConfirmCash}
        initialPaymentMethods={initialPaymentMethods}
        initialVietQrConfig={initialVietQrConfig}
        initialHeaderSeed={billHeaderSeed}
        selfOrderPaymentRequestId={
          billOrderId === null
            ? null
            : (selfOrderPaymentRequestByOrder.get(billOrderId) ?? null)
        }
        onOrderUpdated={() => void refreshSelfOrderWorkflow()}
        onClose={closeBill}
      />

      <HotkeyOverlay open={hotkeyOpen} onOpenChange={setHotkeyOpen} />

      <MultiOrderTablePicker
        open={pickerTable !== null && pickerOrders.length > 0}
        tableNumber={pickerTable?.number ?? null}
        orders={pickerOrders}
        onOpenOrder={handleOpenOrderFromPicker}
        onPayOrder={handlePayOrderFromPicker}
        onAppendOrder={handleAppendOrderFromPicker}
        onCreateNew={handleCreateNewOnOccupied}
        onClose={handleClosePicker}
      />
    </>
  );
}
