"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
import { confirm } from "@/components/confirm-dialog";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { POS_ERROR_CODES } from "./_utils/error-codes";
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
import { TableQuickActionSheet } from "./_components/table-quick-action-sheet";
import { acknowledgeSelfOrderStaffCall } from "./self-order-actions";

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
// Archived orders is off the cash hot path (reprint / cash→VietQR / scroll-back).
// Lazy-loaded for the same reason as CloseSessionSheet.
const ArchivedOrdersSheet = dynamic(
  () =>
    import("./_components/archived-orders-sheet").then((m) => ({
      default: m.ArchivedOrdersSheet,
    })),
  { ssr: false },
);
// BillReceipt + OrderDetailSheet are the two heaviest eager sheets (bill
// pulls the shared QR renderer through the bill sheet; order-detail pulls its full item/
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
import { editPendingOrderItem } from "./actions";
import { VoidRequestSheet } from "./_components/void-request-queue";
import { PosServiceModeSelector } from "./_components/pos-service-mode-selector";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { usePosAppend } from "./_hooks/use-pos-append";
import { useDailyLimitHolds } from "./_hooks/use-daily-limit-holds";
import {
  formatAddToCartBlockMessage,
  useAddToCartGate,
} from "./_hooks/use-add-to-cart-gate";
import { useBillSurface } from "./_hooks/use-bill-surface";
import { useOrderDetailSurface } from "./_hooks/use-order-detail-surface";
import { usePosFloorSelect } from "./_hooks/use-pos-floor-select";
import { usePosTableDerived } from "./_hooks/use-pos-table-derived";
import { usePosVoidRequestQueue } from "./_hooks/use-pos-void-request-queue";
import { useSelfOrderPosState } from "./_hooks/use-self-order-pos-state";
import { submitPosOrderWithRetry } from "./_utils/submit-with-retry";
import { resolvePosMenuListPrice } from "./_lib/delivery-channel";
import type {
  CartItem,
  CartModifier,
  CartSide,
  DeliveryPlatform,
  OrderType,
} from "./types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { BranchTable } from "./page";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import type { VietQrConfig } from "./payment-actions";
import {
  ACTIVE_POS_STATUSES,
  type SessionOrder,
} from "./order-history";
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
  useCartTotal,
} from "./_hooks/use-cart";
import { useActiveTable } from "./_hooks/use-active-table";
import { useAppendTarget } from "./_hooks/use-append-target";
import { isActiveUnpaidPosOrder } from "./_lib/table-order-visual-state";
import { makeCartKey, makeNotedCartKey } from "./_utils/cart-key";
import { messages } from "@lib/messages";
import { StationSheet } from "@/components/surface";

/* ─── Inner (consumes hooks) ─── */

export function PosDesktopInner({
  categories: initialCategories,
  canCloseShift,
  canConfirmCash,
  canPrintProvisional,
  canManageMenuLimits,
  canSplitMerge,
  initialPaymentMethods,
  initialVietQrConfig,
  initialOpenOrderId,
  selfOrderSignalRef,
}: {
  categories: MenuCategory[];
  canCloseShift: boolean;
  canConfirmCash: boolean;
  canPrintProvisional: boolean;
  canManageMenuLimits: boolean;
  canSplitMerge: boolean;
  initialPaymentMethods: readonly PaymentMethod[];
  initialVietQrConfig: VietQrConfig | null;
  initialOpenOrderId?: number;
  /** Filled by shell's private branch-ops bus for instant QR self-order alerts. */
  selfOrderSignalRef: MutableRefObject<(() => void) | null>;
}) {
  const { branchId, session } = usePosSession();
  const router = useRouter();
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
  const cartTotal = useCartTotal();
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
    orderType: OrderType;
    deliveryPlatform: DeliveryPlatform | null;
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
  const [takeawayDraftActive, setTakeawayDraftActive] = useState(false);
  const [deliveryDraftActive, setDeliveryDraftActive] = useState(false);
  const [appendDraftItems, setAppendDraftItems] = useState<CartItem[]>([]);
  const [appendSubmitting, setAppendSubmitting] = useState(false);
  const [hotkeyOpen, setHotkeyOpen] = useState(false);
  const [quickActionTable, setQuickActionTable] = useState<BranchTable | null>(
    null,
  );
  const isTouchLayout = useIsMobile(1280);

  const handleTableQuickAction = useCallback((table: BranchTable) => {
    setQuickActionTable(table);
  }, []);

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

  const {
    state: selfOrderPosState,
    syncFailed: selfOrderSyncFailed,
    actionVisible: selfOrderActionVisible,
    approvalOpen: selfOrderApprovalOpen,
    selectedRequestId: selectedSelfOrderRequestId,
    setApprovalOpen: setSelfOrderApprovalOpen,
    setSelectedRequestId: setSelectedSelfOrderRequestId,
    refresh: refreshSelfOrderPosState,
    refreshWorkflow: refreshSelfOrderWorkflow,
    handleOpenApproval: handleOpenSelfOrderApproval,
    openApprovalForRequest,
    pendingSelfOrderRequestByTable,
    pendingSelfOrderTableIds,
    staffCallByTable,
    staffCallTableIds,
    selfOrderTableNumberById,
    selfOrderPaymentRequestByOrder,
    paymentCallByOrderId,
  } = useSelfOrderPosState({
    branchId,
    audioMode,
    tables,
    orders,
    selfOrderSignalRef,
    refreshOperational,
  });

  const selfOrderInterrupt = useMemo(
    () =>
      selfOrderActionVisible
        ? {
            visible: true,
            failed: selfOrderSyncFailed,
            requestCount: selfOrderPosState.requests.length,
            onOpen: handleOpenSelfOrderApproval,
          }
        : null,
    [
      handleOpenSelfOrderApproval,
      selfOrderActionVisible,
      selfOrderPosState.requests.length,
      selfOrderSyncFailed,
    ],
  );

  const {
    requests: voidRequests,
    syncFailed: voidSyncFailed,
    actionVisible: voidActionVisible,
    open: voidSheetOpen,
    setOpen: setVoidSheetOpen,
    isPending: voidResolvePending,
    handleOpen: handleOpenVoidQueue,
    resolve: resolveVoidRequest,
  } = usePosVoidRequestQueue(branchId);

  const voidInterrupt = useMemo(
    () =>
      voidActionVisible
        ? {
            visible: true,
            failed: voidSyncFailed,
            requestCount: voidRequests.length,
            onOpen: handleOpenVoidQueue,
          }
        : null,
    [
      handleOpenVoidQueue,
      voidActionVisible,
      voidRequests.length,
      voidSyncFailed,
    ],
  );

  const {
    pickerTableId,
    pickerTable,
    pickerOrders,
    allowOccupiedTableId,
    handleTableSelect,
    handleClosePicker,
    handleOpenOrderFromPicker,
    handlePayOrderFromPicker,
    handleAppendOrderFromPicker,
    handleCreateNewOnOccupied,
    handleCreateOrderOnTable,
  } = usePosFloorSelect({
    branchId,
    orders,
    tables,
    cartOrderType,
    selectedTableId,
    selectedTable,
    setActiveTable,
    setCartDrawerOpen,
    setShowOrders,
    startTransition,
    focusOrderWorkflow,
    openBill,
    openApprovalForRequest,
    refreshSelfOrderPosState,
    refreshOperational,
    startAppendTarget,
    setOrderDetailSeed,
    staffCallByTable,
    pendingSelfOrderRequestByTable,
    selfOrderPaymentRequestByOrder,
  });

  const isExplicitOccupied =
    selectedTableId !== null && selectedTableId === allowOccupiedTableId;
  const selectedTableUsable = selectedTableAvailable || isExplicitOccupied;

  const takeawayDraftReady =
    cartOrderType === "takeaway" && takeawayDraftActive;
  const deliveryDraftReady =
    cartOrderType === "delivery" && deliveryDraftActive;
  const orderContextReady =
    takeawayDraftReady || deliveryDraftReady || selectedTableUsable;
  const isAppendingToOrder = appendTarget != null;
  const menuContextReady = orderContextReady || isAppendingToOrder;
  const isServiceGateActive =
    !menuContextReady &&
    (cartOrderType === "takeaway" || cartOrderType === "delivery");
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

    if (deliveryDraftReady) {
      return {
        kind: "new-delivery",
        label: messages.pos.desktop.newDeliveryTarget,
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
    deliveryDraftReady,
  ]);

  useEffect(() => {
    setAppendDraftItems([]);
    setEditingAppendItem(null);
  }, [appendTarget?.orderId]);

  const {
    orderCountByTable,
    tableOrderVisualStateByTable,
    tableTimingByTable,
    tableSeatingTimeByTable,
  } = usePosTableDerived(orders);

  const cartSnapshot = useCartSnapshot();
  // Append / edit-sent prices follow the target order channel, not cart mode.
  const listPriceOrderType: OrderType =
    editingSentItem?.orderType ??
    (appendOrderSummary?.order_type === "delivery" ||
    appendOrderSummary?.order_type === "takeaway" ||
    appendOrderSummary?.order_type === "dine_in"
      ? appendOrderSummary.order_type
      : cartOrderType);
  const listPriceDeliveryPlatform: DeliveryPlatform | null =
    listPriceOrderType === "delivery"
      ? editingSentItem != null
        ? editingSentItem.deliveryPlatform
        : appendOrderSummary != null
          ? appendOrderSummary.delivery_platform === "grab" ||
            appendOrderSummary.delivery_platform === "shopee" ||
            appendOrderSummary.delivery_platform === "be" ||
            appendOrderSummary.delivery_platform === "green_sm"
            ? appendOrderSummary.delivery_platform
            : null
          : cartSnapshot.deliveryPlatform
      : null;
  const deliveryContextReady =
    cartSnapshot.orderType !== "delivery" ||
    (cartSnapshot.deliveryPlatform != null &&
      cartSnapshot.externalOrderRef.trim().length > 0);

  const canSubmit =
    cartItemCount > 0 &&
    deliveryContextReady &&
    (takeawayDraftReady || deliveryDraftReady || selectedTableUsable);
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

  const updateAppendDraftItemQuantity = useCallback(
    (key: string, delta: number) => {
      setAppendDraftItems((currentItems) =>
        currentItems
          .map((item) =>
            item.key === key
              ? { ...item, quantity: item.quantity + delta }
              : item,
          )
          .filter((item) => item.quantity > 0),
      );
    },
    [],
  );

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

  const cancelAppendWorkflow = useCallback(async () => {
    if (appendTarget == null) return;

    if (appendDraftItems.length > 0) {
      const confirmed = await confirm({
        title: messages.pos.appendDraft.cancelTitle,
        description:
          messages.pos.appendDraft.cancelDescription(appendDraftQuantity),
        confirmText: messages.pos.appendDraft.cancel,
        cancelText: messages.pos.appendDraft.keep,
        variant: "destructive",
      });
      if (!confirmed) return;
    }

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
    appendDraftItems.length,
    appendDraftQuantity,
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

  const handleCreateTakeawayOrder = useCallback(() => {
    setCartOrderType("takeaway");
    setActiveTable(null);
    setShowOrders(false);
    setCartDrawerOpen(false);
    setTakeawayDraftActive(true);
    setDeliveryDraftActive(false);
  }, [setActiveTable, setCartOrderType]);

  const handleCreateDeliveryOrder = useCallback(() => {
    setCartOrderType("delivery");
    setActiveTable(null);
    setShowOrders(false);
    // Open cart so platform + app ref are reachable before the first item
    // (delivery identity gates add-to-cart).
    setCartDrawerOpen(true);
    setDeliveryDraftActive(true);
    setTakeawayDraftActive(false);
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
      if (type === "takeaway" || type === "delivery") {
        setActiveTable(null);
      }
      setTakeawayDraftActive(false);
      setDeliveryDraftActive(false);
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
          if (typeof priorityWarning === "string") {
            toast.warning(priorityWarning);
          }
          const discountWarning = result.meta?.discountWarning;
          if (typeof discountWarning === "string") {
            toast.warning(discountWarning);
          }
          toast.success(`Đã tạo đơn ${orderNumber}`, {
            action: {
              label: "Thanh toán",
              onClick: () => openBill(orderId, "payment"),
            },
          });

          resetDailyLimitHoldToken("pos_cart");
          clearCart();
          setTakeawayDraftActive(false);
          setDeliveryDraftActive(false);
          setPostSubmitPaymentOrderId(null);
          focusOrderWorkflow(orderId, orderNumber);
          setActiveTable(null);
          // Reset orderType to home (dine_in when tables exist, else keep
          // takeaway) → jump back to "Chọn bàn | Mang về", symmetric with dine_in.
          setCartOrderType(tables.length > 0 ? "dine_in" : "takeaway");
          void refreshOperational();
        } else {
          // Stale session prop (RSC snapshot held the old session.id after
          // a close-then-reopen on another tab). Self-heal: refresh the
          // route so RSC re-fetches the currently open session, instead
          // of looping the cashier through "thử lại" forever.
          if (result.errorCode === POS_ERROR_CODES.SCOPE_SESSION_NOT_OPEN) {
            toast.error(result.error ?? messages.pos.sessionHeader.closedReload);
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
      const cartSnap = cartStore.getSnapshot();

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
          const listPrice = resolvePosMenuListPrice(
            item,
            listPriceOrderType,
            listPriceDeliveryPlatform,
          );
          if (!listPrice.ok) {
            toast.warning(
              messages.pos.menu.blockedChannelPriceMissing(item.name),
            );
            return;
          }
          const line: CartItem = {
            key: makeCartKey(item.id, undefined, [], []),
            menu_item_id: item.id,
            item_name: item.name,
            quantity: 1,
            unit_price: listPrice.unitPrice,
            modifiers: [],
            sides: [],
          };
          addAppendDraftItem(line);
        }
        return;
      }

      if (cartSnap.orderType === "delivery") {
        if (cartSnap.deliveryPlatform == null) {
          toast.warning(messages.pos.menu.choosePlatformFirst);
          return;
        }
        if (cartSnap.externalOrderRef.trim().length === 0) {
          toast.warning(messages.pos.menu.enterAppRefFirst);
          return;
        }
        const resolved = resolvePosMenuListPrice(
          item,
          "delivery",
          cartSnap.deliveryPlatform,
        );
        if (!resolved.ok) {
          toast.warning(messages.pos.menu.blockedChannelPriceMissing(item.name));
          return;
        }
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
        const listPrice = resolvePosMenuListPrice(
          item,
          listPriceOrderType,
          listPriceDeliveryPlatform,
        );
        if (!listPrice.ok) {
          toast.warning(messages.pos.menu.blockedChannelPriceMissing(item.name));
          return;
        }
        setShowOrders(false);
        addCartItem(item, { unitPrice: listPrice.unitPrice });
      }
    },
    [
      addAppendDraftItem,
      addCartItem,
      appendSubmitting,
      appendTarget,
      cartStore,
      getAddToCartBlock,
      listPriceDeliveryPlatform,
      listPriceOrderType,
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
      const sentOrderType: OrderType =
        orderDetailSummary?.order_type === "delivery" ||
        orderDetailSummary?.order_type === "takeaway" ||
        orderDetailSummary?.order_type === "dine_in"
          ? orderDetailSummary.order_type
          : "dine_in";
      const sentPlatform =
        orderDetailSummary?.delivery_platform === "grab" ||
        orderDetailSummary?.delivery_platform === "shopee" ||
        orderDetailSummary?.delivery_platform === "be" ||
        orderDetailSummary?.delivery_platform === "green_sm"
          ? orderDetailSummary.delivery_platform
          : null;
      // Clear other editing modes — only one customizer flow active at a time.
      setEditingCartItem(null);
      setEditingAppendItem(null);
      setEditingSentItem({
        orderItemId: snapshot.id,
        seedCartItem,
        orderType: sentOrderType,
        deliveryPlatform: sentPlatform,
      });
      setCustomizerItem(menuItem);
    },
    [menuItemById, orderDetailSummary],
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
      discountType: "vnd" | undefined,
      discountValue: number | undefined,
      discountNote: string | undefined,
    ) => {
      const hasDiscount =
        discountType === "vnd" && discountValue !== undefined;
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
            if (r.data?.printWarning) {
              toast.warning(r.data.printWarning);
            }
            void refreshOperational();
            // closeCustomizerAndMaybeReopenDetail clears editing state +
            // reopens the order detail sheet from the pre-customize
            // snapshot so cashier sees the freshly-edited order.
            closeCustomizerAndMaybeReopenDetail();
          } else if (
            r.errorCode === POS_ERROR_CODES.ITEM_NOT_EDITABLE
          ) {
            toast.error(r.error ?? "Không thể sửa món.");
            void refreshOperational();
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
          if (cartOrderType === "delivery") return;
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
        onUpdateQuantity: updateAppendDraftItemQuantity,
        onEditItem: handleAppendDraftItemEdit,
      },
      onSubmitOrder: handleSubmitOrder,
      onCustomizeItem: handleCartItemCustomize,
      onViewBill: openBill,
      onViewDetail: openDetail,
      onOpenArchivedSheet: handleOpenArchivedSheet,
      onReturnToTables: handleReturnToTables,
      hideTakeawayOrders: isServiceGateActive,
      paymentCallByOrderId,
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
      updateAppendDraftItemQuantity,
      handleAppendDraftItemEdit,
      handleSubmitOrder,
      handleCartItemCustomize,
      openBill,
      openDetail,
      handleOpenArchivedSheet,
      handleReturnToTables,
      isServiceGateActive,
      paymentCallByOrderId,
    ],
  );

  const serviceModeSelector = (
    <PosServiceModeSelector
      cartOrderType={cartOrderType}
      cartItemCount={cartItemCount}
      onOrderTypeChange={handleOrderTypeChange}
    />
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
    if (cartOrderType === "delivery") {
      setDeliveryDraftActive(false);
      return;
    }
    setActiveTable(null);
  }, [cartItemCount, cartOrderType, setActiveTable]);

  const handleEditDelivery = useCallback(() => {
    setShowOrders(false);
    setCartDrawerOpen(true);
  }, []);

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
        onEditDelivery={handleEditDelivery}
      />
    ) : null;

  const mobileHeaderContextLabel = menuContextReady
    ? (orderTargetLabel ?? undefined)
    : undefined;

  const mobileSidebarDrawer = isTouchLayout ? (
    <StationSheet
      open={cartDrawerOpen}
      onOpenChange={setCartDrawerOpen}
      side="bottom"
      fullscreen
      title={
        appendTarget != null
          ? `${messages.pos.desktop.pendingAppendTitle}${
              orderTargetLabel ? ` · ${orderTargetLabel}` : ""
            }`.trim()
          : showOrders
            ? (() => {
                const count = isServiceGateActive
                  ? orders.filter((o) => o.order_type === "dine_in").length
                  : orders.length;
                return (
                  <span className="flex items-center gap-2">
                    <span>
                      {isServiceGateActive
                        ? messages.pos.orderHistory.dineInSessionOrders
                        : messages.pos.orderHistory.sessionOrders}
                    </span>
                    <Badge
                      variant={count > 0 ? "secondary" : "outline"}
                      className="h-5 min-w-5 px-1.5 text-xs font-semibold tabular-nums"
                    >
                      {count}
                    </Badge>
                  </span>
                );
              })()
            : orderTargetLabel
              ? `${messages.pos.desktop.pendingNewTitle} · ${orderTargetLabel}`
              : messages.pos.desktop.pendingNewTitle
      }
      bodyClassName="p-0"
    >
      <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <PosSidebarContent
          {...sidebarContentProps}
          onClosePane={() => setCartDrawerOpen(false)}
        />
      </div>
    </StationSheet>
  ) : null;

  // POS stays touch-first through tablet widths. The desktop split pane starts
  // at xl so tablet portrait/landscape keeps the drawer + sticky CTA workflow.
  const sidebars = isTouchLayout ? null : (
    <SplitSidebar
      canCloseShift={canCloseShift}
      canManageMenuLimits={canManageMenuLimits}
      onShowCloseSession={openCloseSession}
      selfOrderInterrupt={selfOrderInterrupt}
      voidInterrupt={voidInterrupt}
      isContextGate={!menuContextReady}
      sidebarContentProps={sidebarContentProps}
    />
  );

  return (
    <>
      {isTouchLayout ? (
        <PosSessionTopBar
          canCloseShift={canCloseShift}
          canManageMenuLimits={canManageMenuLimits}
          onShowCloseSession={openCloseSession}
          contextLabel={mobileHeaderContextLabel}
          onBack={
            isAppendingToOrder
              ? cancelAppendWorkflow
              : orderContextReady
                ? handleSwitchTableMode
                : undefined
          }
          selfOrderInterrupt={selfOrderInterrupt}
          voidInterrupt={voidInterrupt}
        />
      ) : null}

      {!menuContextReady ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {cartOrderType === "dine_in" ? (
              <PosTableGate
                tables={tables}
                selectedTableId={selectedTableId}
                onTableSelect={handleTableSelect}
                onTableQuickAction={handleTableQuickAction}
                orderCountByTable={orderCountByTable}
                tableOrderVisualStateByTable={tableOrderVisualStateByTable}
                tableSeatingTimeByTable={tableSeatingTimeByTable}
                tableTimingByTable={tableTimingByTable}
                pendingSelfOrderTableIds={pendingSelfOrderTableIds}
                staffCallTableIds={staffCallTableIds}
                headerAction={serviceModeSelector}
                className="min-h-0 flex-1"
              />
            ) : (
              <PosTakeawayGate
                mode={cartOrderType === "delivery" ? "delivery" : "takeaway"}
                orders={orders}
                onCreateNew={
                  cartOrderType === "delivery"
                    ? handleCreateDeliveryOrder
                    : handleCreateTakeawayOrder
                }
                onViewDetail={openDetail}
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
              orderType={listPriceOrderType}
              deliveryPlatform={listPriceDeliveryPlatform}
              onItemTap={handleItemTap}
            />
          </div>
          {sidebars}
        </div>
      )}

      <PosMobileActionBar
        isTouchLayout={isTouchLayout}
        isAppendingToOrder={isAppendingToOrder}
        menuContextReady={menuContextReady}
        cartQuantity={cartQuantity}
        cartTotal={cartTotal}
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
        staffCalls={selfOrderPosState.staffCalls ?? []}
        focusedRequestId={selectedSelfOrderRequestId}
        tableNumberById={selfOrderTableNumberById}
        orders={orders}
        onOpenChange={(open) => {
          setSelfOrderApprovalOpen(open);
          if (!open) setSelectedSelfOrderRequestId(null);
        }}
        onUpdated={refreshSelfOrderWorkflow}
        onAcknowledgeStaffCall={async (callId) => {
          await acknowledgeSelfOrderStaffCall({ callId });
          void refreshSelfOrderPosState();
        }}
      />
      <VoidRequestSheet
        open={voidSheetOpen}
        onOpenChange={setVoidSheetOpen}
        requests={voidRequests}
        isPending={voidResolvePending}
        onResolve={resolveVoidRequest}
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
        listPriceOrderType={listPriceOrderType}
        listPriceDeliveryPlatform={listPriceDeliveryPlatform}
      />

      <OrderDetailSheet
        branchId={branchId}
        orderId={orderDetailId}
        orderNumber={orderDetailNumber}
        refreshToken={detailRefreshTick}
        initialOrder={orderDetailSeed?.order ?? null}
        initialCanManage={orderDetailSeed?.canManage ?? false}
        initialCanCancelOrder={orderDetailSeed?.canCancelOrder ?? false}
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
        canConfirmCash={canConfirmCash}
        vietQrEnabled={initialPaymentMethods.includes("vietqr")}
        onViewBill={(id) => {
          // Reprint flow: archived rows always open in receipt-only mode.
          // Close the sheet first so we don't stack StationSheet over StationSheet.
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
        canPrintProvisional={canPrintProvisional}
        initialPaymentMethods={initialPaymentMethods}
        initialVietQrConfig={initialVietQrConfig}
        initialHeaderSeed={billHeaderSeed}
        selfOrderPaymentRequestId={
          billOrderId === null || billIntent === "receipt"
            ? null
            : (selfOrderPaymentRequestByOrder.get(billOrderId)?.id ?? null)
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

      <TableQuickActionSheet
        table={quickActionTable}
        open={quickActionTable !== null}
        onOpenChange={(open) => {
          if (!open) setQuickActionTable(null);
        }}
        activeOrder={
          quickActionTable
            ? (orders.find(
                (o) =>
                  o.table_id === quickActionTable.id &&
                  isActiveUnpaidPosOrder(o, ACTIVE_POS_STATUSES),
              ) ?? null)
            : null
        }
        orderCount={
          quickActionTable
            ? (orderCountByTable.get(quickActionTable.id) ?? 0)
            : 0
        }
        onOpenBill={(orderId) => openBill(orderId, "payment")}
        onOpenDetail={(orderId, orderNumber) =>
          focusOrderWorkflow(orderId, orderNumber)
        }
        onStartAppend={(orderId, orderNumber) => {
          setCartDrawerOpen(false);
          startAppendTarget(orderId, orderNumber);
          setShowOrders(false);
          toast.message("Chạm món trên thực đơn để gọi thêm");
        }}
        onTransferTable={(orderId) => {
          focusOrderWorkflow(orderId, "");
        }}
        onStartNewOrder={(tableId) => {
          setActiveTable(tableId);
        }}
        onPrintProvisional={(orderId) => {
          openBill(orderId, "receipt");
        }}
      />
    </>
  );
}
