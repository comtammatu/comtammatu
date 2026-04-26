"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
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
import { X as IconX } from "lucide-react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { PosTableGate } from "./pos-table-gate";
import { MultiOrderTablePicker } from "./_components/multi-order-table-picker";
import { ItemCustomizer } from "./item-customizer";
import { CloseSessionSheet } from "./close-session-sheet";
import { BillReceipt } from "./_components/bill/bill-receipt-sheet";
import { OrderDetailSheet } from "./order-detail-sheet";
import { PosSessionHeader } from "./pos-session-header";
import { MenuPane } from "./_components/menu-pane";
import { PosMobileActionBar } from "./_components/pos-mobile-action-bar";
import {
  SplitSidebar,
  TabbedSidebar,
} from "./_components/pos-sidebar-variants";
import { PosSidebarContent } from "./pos-sidebar-panel";
import { HotkeyOverlay } from "./_components/hotkey-overlay";
import { fetchActiveOrderForTable } from "./actions";
import { usePosAppend } from "./_hooks/use-pos-append";
import { submitPosOrderWithRetry } from "./_utils/submit-with-retry";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { ActiveSession, BranchTable } from "./page";
import { ACTIVE_POS_STATUSES, type SessionOrder } from "./order-history";
import type {
  BillReceiptIntent,
  OrderData,
} from "./_components/bill/bill-receipt-types";
import type { OrderDetailData } from "./order-detail-sheet";
import {
  PosDesktopProvider,
  usePosOperationalDispatch,
  usePosOrders,
  usePosTables,
  usePosCartStore,
  usePosSession,
} from "./_providers/pos-desktop-provider";
import {
  useCartActions,
  useCartItemCount,
  useCartOrderType,
  useCartQuantity,
} from "./_hooks/use-cart";
import { useActiveTable } from "./_hooks/use-active-table";
import { useAppendTarget } from "./_hooks/use-append-target";
import { makeCartKey, makeNotedCartKey } from "./_utils/cart-key";

interface PosDesktopShellProps {
  branchId: number;
  categories: MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
  initialOrderType: OrderType;
  /** Orders prefetched by RSC. Seeds provider state to skip mount-time refetch. */
  initialOrders: SessionOrder[];
  /**
   * True when RSC `fetchSessionOrders` succeeded. Lets the realtime hook skip
   * its first SUBSCRIBED catch-up refresh (already covered by the RSC seed).
   * False when RSC fetch failed → fall back to old behavior, first SUBSCRIBED
   * fires a full refresh as recovery.
   */
  initialOrdersSeeded: boolean;
  /** User hiện tại có `pos:close_shift` không (ẩn nút"Chốt ca" với waiter). */
  canCloseShift: boolean;
  /** `pos:confirm_payment` — gate phương thức"Tiền mặt" trên bill (cashier+). */
  canConfirmCash: boolean;
}

function isOrderAwaitingPayment(order: {
  status: string;
  payment_status: string | null;
}) {
  return (
    ["new", "confirmed", "preparing", "ready", "served"].includes(
      order.status,
    ) && order.payment_status !== "paid"
  );
}

export function PosDesktopShell(props: PosDesktopShellProps) {
  return (
    <PosDesktopProvider
      branchId={props.branchId}
      session={props.session}
      initialTables={props.tables}
      initialOrderType={props.initialOrderType}
      initialOrders={props.initialOrders}
      initialOrdersSeeded={props.initialOrdersSeeded}
    >
      <PosDesktopInner
        categories={props.categories}
        canCloseShift={props.canCloseShift}
        canConfirmCash={props.canConfirmCash}
      />
    </PosDesktopProvider>
  );
}

/* ─── Inner (consumes hooks) ─── */

function PosDesktopInner({
  categories,
  canCloseShift,
  canConfirmCash,
}: {
  categories: MenuCategory[];
  canCloseShift: boolean;
  canConfirmCash: boolean;
}) {
  const { branchId, session } = usePosSession();
  const orders = usePosOrders();
  const tables = usePosTables();
  const { refreshOrders, refreshOrdersDeduped } = usePosOperationalDispatch();
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

  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [billIntent, setBillIntent] = useState<BillReceiptIntent>("payment");
  // Seed passed to BillReceipt when we just came from OrderDetailSheet
  // on the same order — lets BillReceipt skip its own fetch. Null for
  // bill opens from any other path (toast action, order-list direct
  // open) so BillReceipt falls back to fetchOrderForBill(orderId).
  const [billInitialOrder, setBillInitialOrder] = useState<OrderData | null>(
    null,
  );
  const [orderDetailId, setOrderDetailId] = useState<number | null>(null);
  const [orderDetailNumber, setOrderDetailNumber] = useState<string | null>(
    null,
  );
  // Lightweight summary handed to OrderDetailSheet so its header (số đơn,
  // bàn / mang về) renders immediately on a list-row tap. Fresh fetch always
  // wins for items + totals; this only fills the gap during the items
  // skeleton phase. Cleared on sheet close + on table-tap (which provides
  // full data via orderDetailSeed instead).
  const [orderDetailSummary, setOrderDetailSummary] =
    useState<SessionOrder | null>(null);
  // Seed for OrderDetailSheet's first render. Populated when the cashier
  // taps an occupied table (`fetchActiveOrderForTable` already returns the
  // full detail + canManage hint) so the sheet can paint items/total
  // without its own fetchOrderDetail round-trip. Null for code paths
  // that only know the orderId (e.g. post-submit `focusOrderWorkflow`,
  // OrderListPane detail open) → sheet falls back to its normal fetch.
  const [orderDetailSeed, setOrderDetailSeed] = useState<{
    order: OrderDetailData;
    canManage: boolean;
  } | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [appendDraftItems, setAppendDraftItems] = useState<CartItem[]>([]);
  const [appendSubmitting, setAppendSubmitting] = useState(false);
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);
  const [hotkeyOpen, setHotkeyOpen] = useState(false);
  // Multi-order-per-table (PR3 Gộp bàn Option A): when user taps an occupied
  // table, show a picker listing active orders +"Tạo đơn mới" button. The
  // picker is the only path to start a 2nd order on the same physical table.
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
  const isMobile = useIsMobile();

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

  const bumpDetailRefresh = useCallback(() => {
    setDetailRefreshTick((t) => t + 1);
  }, []);

  const refreshOperational = useCallback(async () => {
    // Deduped fire-and-forget: if realtime already fired a fetch for
    // the same mutation, this call coalesces instead of racing. Detail
    // sheet refresh-token fires independently so its own refetch kicks
    // in regardless of orders-list fetch timing.
    refreshOrdersDeduped();
    bumpDetailRefresh();
  }, [refreshOrdersDeduped, bumpDetailRefresh]);

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

  const orderContextReady = cartOrderType === "takeaway" || selectedTableUsable;
  const isAppendingToOrder = appendTarget != null;
  const menuContextReady = orderContextReady || isAppendingToOrder;
  const selectedTableNumber = selectedTable?.number;
  const appendDraftQuantity = useMemo(
    () => appendDraftItems.reduce((sum, item) => sum + item.quantity, 0),
    [appendDraftItems],
  );

  useEffect(() => {
    setAppendDraftItems([]);
  }, [appendTarget?.orderId]);

  // Count active orders per table — drives the"N đơn" badge on multi-order
  // tables and the picker's order list.
  const orderCountByTable = useMemo(() => {
    const map = new Map<number, number>();
    for (const order of orders) {
      if (
        order.table_id !== null &&
        ACTIVE_POS_STATUSES.includes(order.status)
      ) {
        map.set(order.table_id, (map.get(order.table_id) ?? 0) + 1);
      }
    }
    return map;
  }, [orders]);

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
        ? orders.filter(
            (o) =>
              o.table_id === pickerTableId &&
              ACTIVE_POS_STATUSES.includes(o.status),
          )
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
    cartItemCount > 0 && (cartOrderType === "takeaway" || selectedTableUsable);

  const focusOrderWorkflow = useCallback(
    (orderId: number, orderNumber?: string | null) => {
      setShowOrders(true);
      setOrderDetailId(orderId);
      setOrderDetailNumber(orderNumber ?? null);
      setCartDrawerOpen(false);
    },
    [],
  );

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

  const cancelAppendWorkflow = useCallback(() => {
    if (appendTarget == null) return;

    const target = appendTarget;
    setAppendDraftItems([]);
    clearAppendTarget();
    setCustomizerItem(null);
    setEditingCartItem(null);
    setCartDrawerOpen(false);
    focusOrderWorkflow(target.orderId, target.orderNumber);
  }, [appendTarget, clearAppendTarget, focusOrderWorkflow]);

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
    void performAppend(target, items, {
      onSuccess: () => {
        setAppendDraftItems([]);
        clearAppendTarget();
        setCustomizerItem(null);
        setEditingCartItem(null);
        setCartDrawerOpen(false);
        focusOrderWorkflow(target.orderId, target.orderNumber);
      },
    }).finally(() => setAppendSubmitting(false));
  }, [
    appendDraftItems,
    appendSubmitting,
    appendTarget,
    clearAppendTarget,
    focusOrderWorkflow,
    performAppend,
  ]);

  const handleTableSelect = useCallback(
    (table: BranchTable) => {
      if (table.status === "available") {
        setActiveTable(selectedTableId === table.id ? null : table.id);
        return;
      }

      if (table.status !== "occupied") {
        toast.message("Bàn này chưa sẵn sàng để nhận order.");
        return;
      }

      // Multi-order-per-table: tap on occupied table opens a picker showing
      // active orders +"Tạo đơn mới" button. The picker is the discoverable
      // entry point for the new"2nd order on same bàn" flow.
      const activeOrders = orders.filter(
        (o) =>
          o.table_id === table.id && ACTIVE_POS_STATUSES.includes(o.status),
      );

      if (activeOrders.length === 0) {
        // Edge case: tables.status is occupied but no active order surfaces in
        // the current orders list (stale realtime, cross-session race). Fall
        // back to the legacy single-fetch path so the cashier still sees the
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

  const handleCreateNewOnOccupied = useCallback(() => {
    if (pickerTableId === null) return;
    const tableId = pickerTableId;
    setPickerTableId(null);
    setAllowOccupiedTableId(tableId);
    setActiveTable(tableId);
    setCartDrawerOpen(false);
  }, [pickerTableId, setActiveTable]);

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
    },
    [
      cartItemCount,
      cartOrderType,
      selectedTableId,
      setActiveTable,
      setCartOrderType,
    ],
  );

  const handleSubmitOrder = useCallback(() => {
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await submitPosOrderWithRetry({
        branchId,
        sessionId: session.id,
        cartSnapshot: cartStore.getSnapshot(),
        tableId: selectedTableId,
      });

      if (result.success && result.data) {
        const orderId = result.data.order_id;
        const orderNumber = result.data.order_number;
        toast.success(`Đặt món thành công — #${orderNumber}`, {
          action: {
            label: "Xem hóa đơn",
            onClick: () => {
              setBillIntent("payment");
              setBillOrderId(orderId);
            },
          },
        });
        const kitchenWarning = result.meta?.kitchenWarning;
        if (typeof kitchenWarning === "string") {
          toast.warning(kitchenWarning);
        } else if (result.meta?.kitchenSent === true) {
          toast.success("Đã gửi phiếu bếp", { duration: 2000 });
        }

        clearCart();
        focusOrderWorkflow(orderId, orderNumber);
        setActiveTable(null);
        void refreshOperational();
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [
    canSubmit,
    branchId,
    cartStore,
    clearCart,
    selectedTableId,
    setActiveTable,
    session.id,
    focusOrderWorkflow,
    refreshOperational,
  ]);

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
          setCustomizerItem(item);
        } else {
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
        setCustomizerItem(item);
      } else {
        setShowOrders(false);
        addCartItem(item);
      }
    },
    [addAppendDraftItem, addCartItem, appendSubmitting, appendTarget],
  );

  const handleCartItemCustomize = useCallback(
    (cartItem: CartItem) => {
      const menuItem = menuItemById.get(cartItem.menu_item_id);
      if (!menuItem) {
        toast.error("Món này không còn trong thực đơn.");
        return;
      }

      setEditingCartItem(cartItem);
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
    ) => {
      if (editingCartItem) {
        const hasNote = note !== undefined && note.length > 0;
        const baseKey = makeCartKey(item.id, variantId, modifiers, sides);
        const key = hasNote ? makeNotedCartKey(baseKey) : baseKey;
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

      if (appendTarget) {
        if (appendSubmitting) {
          toast.message("Đang gửi món thêm, vui lòng chờ...");
          return;
        }
        const hasNote = note !== undefined && note.length > 0;
        const baseKey = makeCartKey(item.id, variantId, modifiers, sides);
        const key = hasNote ? makeNotedCartKey(baseKey) : baseKey;
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
      });
      setCustomizerItem(null);
    },
    [
      addCartItem,
      addAppendDraftItem,
      appendSubmitting,
      appendTarget,
      cartStore,
      editingCartItem,
      replaceCartItems,
    ],
  );

  const openBill = useCallback(
    (id: number, intent: BillReceiptIntent = "payment", seed?: OrderData) => {
      setCartDrawerOpen(false);
      setBillIntent(intent);
      setBillInitialOrder(seed ?? null);
      setBillOrderId(id);
    },
    [],
  );

  const closeBill = useCallback(() => {
    setBillOrderId(null);
    setBillIntent("payment");
    setBillInitialOrder(null);
  }, []);

  const openDetail = useCallback(
    (id: number, orderNumber?: string | null, summary?: SessionOrder) => {
      setCartDrawerOpen(false);
      // Clear any table-tap seed: this path (OrderListPane row tap) does
      // NOT have the full detail with items, so OrderDetailSheet falls
      // back to its own fetch. The summary, when available, lets the
      // sheet header (số đơn, bàn / mang về) render instantly while items
      // load — saves the 500-1000ms blank-modal flash on slow networks.
      setOrderDetailSeed(null);
      setOrderDetailSummary(summary ?? null);
      setOrderDetailId(id);
      setOrderDetailNumber(orderNumber ?? null);
    },
    [],
  );

  const closeOrderDetail = useCallback(() => {
    setOrderDetailId(null);
    setOrderDetailNumber(null);
    setOrderDetailSeed(null);
    setOrderDetailSummary(null);
  }, []);

  useKeyboardShortcut([
    {
      key: "?",
      shift: true,
      handler: () => setHotkeyOpen((v) => !v),
    },
    {
      key: "F10",
      preventDefault: true,
      handler: canCloseShift ? openCloseSession : () => {},
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
    {
      key: "F9",
      preventDefault: true,
      handler: () => {
        const awaiting = orders.find(isOrderAwaitingPayment);
        if (awaiting) {
          openBill(awaiting.id);
        } else {
          toast.message("Không có đơn chờ thanh toán");
        }
      },
    },
  ]);

  const handleReturnToTables = useCallback(() => {
    setShowOrders(false);
    setCartDrawerOpen(false);
    setActiveTable(null);
  }, [setActiveTable]);

  const sidebarContentProps = {
    showOrders,
    canSubmit,
    isPending,
    appendDraft: {
      target: appendTarget,
      items: appendDraftItems,
      isSubmitting: appendSubmitting,
      onSubmit: handleSubmitAppendDraft,
      onCancel: cancelAppendWorkflow,
      onRemoveItem: removeAppendDraftItem,
    },
    onSubmitOrder: handleSubmitOrder,
    onOrderTypeChange: handleOrderTypeChange,
    onCustomizeItem: handleCartItemCustomize,
    onViewBill: openBill,
    onViewDetail: openDetail,
    onReturnToTables: handleReturnToTables,
  } as const;

  const serviceModeSelector = (
    <ToggleGroup
      type="single"
      value={cartOrderType}
      variant="outline"
      className="grid h-10 w-full grid-cols-2 gap-0"
      onValueChange={(value) => {
        if (value === "dine_in" || value === "takeaway") {
          handleOrderTypeChange(value);
        }
      }}
    >
      <ToggleGroupItem
        value="dine_in"
        className="h-full justify-center text-base font-semibold"
        disabled={cartItemCount > 0 && cartOrderType !== "dine_in"}
      >
        Tại bàn
      </ToggleGroupItem>
      <ToggleGroupItem
        value="takeaway"
        className="h-full justify-center text-base font-semibold"
        disabled={cartItemCount > 0 && cartOrderType !== "takeaway"}
      >
        Mang về
      </ToggleGroupItem>
    </ToggleGroup>
  );

  const appendBannerRow =
    appendTarget != null ? (
      <div
        className="border-b border-warning/15 bg-warning/10 px-3 py-3 md:px-4"
        role="status"
      >
        <Alert className="border-warning/20 bg-warning/10">
          <AlertDescription className="relative flex items-center justify-between gap-2 text-current">
            <p className="min-w-0 text-base leading-6 text-foreground">
              <span className="font-semibold">
                Thêm món vào đơn #{appendTarget.orderNumber}
              </span>
              <span className="text-muted-foreground">
                {""}
                {appendDraftQuantity > 0
                  ? `${String(appendDraftQuantity)} món đang chờ gửi.`
                  : "Chọn món trên menu, chưa gửi bếp cho tới khi xác nhận."}
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 min-h-11 min-w-11 shrink-0 gap-1 px-3 text-sm text-foreground hover:bg-warning/25"
              onClick={cancelAppendWorkflow}
            >
              <IconX data-icon="inline-start" />
              Hủy
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    ) : null;

  const mobileOrderContextRow =
    isMobile && menuContextReady ? (
      <div className="border-b border-border/60 bg-background/75 px-2 py-1 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {appendTarget != null
                ? `Thêm món #${appendTarget.orderNumber}`
                : cartOrderType === "takeaway"
                  ? "Mang về"
                  : `Bàn ${selectedTableNumber ?? ""}`}
            </p>
          </div>
          {appendTarget == null &&
            (cartOrderType === "takeaway" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 shrink-0 px-2.5 text-xs font-bold"
                disabled={cartItemCount > 0}
                onClick={() => {
                  setShowOrders(false);
                  setCartDrawerOpen(false);
                  handleOrderTypeChange("dine_in");
                }}
              >
                Chọn bàn
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 shrink-0 px-2.5 text-xs font-bold"
                onClick={() => {
                  setShowOrders(false);
                  setCartDrawerOpen(false);
                  setActiveTable(null);
                }}
              >
                Đổi bàn
              </Button>
            ))}
        </div>
      </div>
    ) : null;

  const mobileSidebarDrawer = isMobile ? (
    <Drawer
      open={cartDrawerOpen}
      onOpenChange={setCartDrawerOpen}
      shouldScaleBackground={false}
    >
      <DrawerContent
        showHandle
        className="h-dvh max-h-dvh p-0 before:inset-0 sm:h-5/6 sm:p-2 sm:before:inset-2"
      >
        <DrawerTitle className="sr-only">
          {appendTarget != null
            ? `Món thêm cho đơn #${appendTarget.orderNumber}`
            : showOrders
              ? "Đơn trong ca"
              : "Giỏ đơn mới"}
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

  const sidebars = (
    <>
      <TabbedSidebar
        session={session}
        canCloseShift={canCloseShift}
        onShowCloseSession={openCloseSession}
        showOrders={showOrders}
        onShowOrdersChange={setShowOrders}
        sidebarContentProps={sidebarContentProps}
      />
      <SplitSidebar
        session={session}
        canCloseShift={canCloseShift}
        onShowCloseSession={openCloseSession}
        sidebarContentProps={sidebarContentProps}
      />
    </>
  );

  return (
    <>
      <div className="md:hidden">
        <PosSessionHeader
          session={session}
          canCloseShift={canCloseShift}
          onShowCloseSession={openCloseSession}
        />
      </div>

      {!menuContextReady ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appendBannerRow}
            <div className="border-b border-border/60 bg-background/75 px-2 py-2 md:hidden">
              {serviceModeSelector}
            </div>
            <PosTableGate
              tables={tables}
              selectedTableId={selectedTableId}
              onTableSelect={handleTableSelect}
              orderCountByTable={orderCountByTable}
              className="min-h-0 flex-1"
            />
          </div>
          {sidebars}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appendBannerRow}
            {mobileOrderContextRow}
            <MenuPane categories={categories} onItemTap={handleItemTap} />
          </div>
          {sidebars}
        </div>
      )}

      <PosMobileActionBar
        isMobile={isMobile}
        isAppendingToOrder={isAppendingToOrder}
        menuContextReady={menuContextReady}
        cartOrderType={cartOrderType}
        selectedTableId={selectedTableId}
        cartQuantity={cartQuantity}
        appendDraftQuantity={appendDraftQuantity}
        ordersCount={orders.length}
        onOpenOrdersDrawer={() => {
          setShowOrders(true);
          void refreshOrders();
          setCartDrawerOpen(true);
        }}
        onEnterTablePicker={() => {
          setShowOrders(false);
          setCartDrawerOpen(false);
          handleOrderTypeChange("dine_in");
          setActiveTable(null);
        }}
        onOpenCartDrawer={() => {
          setShowOrders(false);
          setCartDrawerOpen(true);
        }}
        onOpenAppendDrawer={() => {
          setShowOrders(false);
          setCartDrawerOpen(true);
        }}
      />
      {mobileSidebarDrawer}

      <ItemCustomizer
        item={customizerItem}
        onClose={() => {
          setCustomizerItem(null);
          setEditingCartItem(null);
        }}
        onConfirm={handleCustomizerConfirm}
        mode={editingCartItem ? "edit" : appendTarget ? "append" : "new"}
        appendOrderLabel={appendTarget?.orderNumber ?? null}
        initialCartItem={editingCartItem}
      />

      <OrderDetailSheet
        orderId={orderDetailId}
        orderNumber={orderDetailNumber}
        refreshToken={detailRefreshTick}
        initialOrder={orderDetailSeed?.order ?? null}
        initialCanManage={orderDetailSeed?.canManage ?? false}
        initialSummary={orderDetailSummary}
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
          toast.message("Chọn món trên menu, kiểm tra lại rồi gửi món thêm");
        }}
        onReorderToCart={(items, skippedCount) => {
          replaceCartItems(items);
          setShowOrders(false);
          if (skippedCount > 0) {
            toast.message(
              `Đã bỏ qua ${String(skippedCount)} món không còn trong thực đơn.`,
            );
          } else {
            toast.success("Đã tạo giỏ đơn mới từ đơn cũ");
          }
        }}
        tables={tables}
        orderCountByTable={orderCountByTable}
        onOrderUpdated={() => void refreshOperational()}
      />

      <CloseSessionSheet
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      <BillReceipt
        branchId={branchId}
        orderId={billOrderId}
        intent={billIntent}
        initialOrder={billInitialOrder}
        canConfirmCash={canConfirmCash}
        onOrderUpdated={() => void refreshOperational()}
        onClose={closeBill}
      />

      <HotkeyOverlay open={hotkeyOpen} onOpenChange={setHotkeyOpen} />

      <MultiOrderTablePicker
        open={pickerTable !== null && pickerOrders.length > 0}
        tableNumber={pickerTable?.number ?? null}
        orders={pickerOrders}
        onOpenOrder={handleOpenOrderFromPicker}
        onCreateNew={handleCreateNewOnOccupied}
        onClose={handleClosePicker}
      />
    </>
  );
}
