"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { POS_ERROR_CODES } from "./_utils/error-codes";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { PosTableGate } from "./pos-table-gate";
import { ItemCustomizer } from "./item-customizer";
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

// Lazy-load 3 modals OFF the cash path. Trims first-paint JS by ~14KB
// minified (Sheet/Drawer/Card deps) without affecting payment latency.
//
// HotkeyOverlay: rare ?-key help.
// CloseSessionSheet: once per shift via F10.
// MultiOrderTablePicker: only when cashier taps an occupied table.
//
// BillReceipt + OrderDetailSheet + ItemCustomizer stay EAGER — they
// participate in HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN +
// HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK + POS-PAYMENT-REUSE-UNIQUE-SLOT;
// any chunk-load latency mid-payment is an unrecoverable cash risk.
import { ACTIONS_VI } from "@comtammatu/shared/messages";
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
import { fetchActiveOrderForTable, editPendingOrderItem } from "./actions";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { usePosAppend } from "./_hooks/use-pos-append";
import { submitPosOrderWithRetry } from "./_utils/submit-with-retry";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { ActiveSession, BranchTable } from "./page";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import type { VietQrConfig } from "./payment-actions";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
  type SessionOrder,
} from "./order-history";
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
import type { DailyLimitsMap } from "./_providers/pos-desktop-provider";
import {
  useCartActions,
  useCartItemCount,
  useCartOrderType,
  useCartQuantity,
} from "./_hooks/use-cart";
import { useActiveTable } from "./_hooks/use-active-table";
import { useAppendTarget } from "./_hooks/use-append-target";
import { makeCartKey, makeNotedCartKey } from "./_utils/cart-key";
import { messages } from "@lib/messages";

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
  /** `pos:close_shift_variance_override` — cho phép đóng ca khi chênh lệch
   *  vượt ngưỡng (BM+). Cashier không có quyền → block ở UI khi variance gate. */
  canOverrideVariance: boolean;
  /** Tenant payment methods seeded từ RSC — bill render không phải đợi fetch. */
  initialPaymentMethods: readonly PaymentMethod[];
  /** Tenant VietQR config seeded từ RSC; null nếu disable / chưa cấu hình. */
  initialVietQrConfig: VietQrConfig | null;
}

function isOrderAwaitingPayment(order: {
  status: string;
  payment_status: string | null;
}) {
  return (
    ACTIVE_POS_STATUSES.includes(order.status) &&
    order.payment_status !== "paid"
  );
}

export function PosDesktopShell(props: PosDesktopShellProps) {
  // Extract the volatile slice (sold_today / is_disabled / limit_quantity)
  // from RSC's `fetchMenuForPos` snapshot so the provider can patch it in
  // real time via `useDailyLimitSync` without re-fetching the whole menu
  // structure on each event. Items without a limit row simply aren't keys.
  const initialDailyLimits = useMemo<DailyLimitsMap>(() => {
    const map = new Map<number, NonNullable<MenuItem["daily_limit"]>>();
    for (const category of props.categories) {
      for (const item of category.menu_items) {
        if (item.daily_limit) {
          map.set(item.id, item.daily_limit);
        }
      }
    }
    return map;
  }, [props.categories]);

  return (
    <PosDesktopProvider
      branchId={props.branchId}
      session={props.session}
      initialTables={props.tables}
      initialOrderType={props.initialOrderType}
      initialOrders={props.initialOrders}
      initialOrdersSeeded={props.initialOrdersSeeded}
      initialDailyLimits={initialDailyLimits}
    >
      <PosDesktopInner
        categories={props.categories}
        canCloseShift={props.canCloseShift}
        canConfirmCash={props.canConfirmCash}
        canOverrideVariance={props.canOverrideVariance}
        initialPaymentMethods={props.initialPaymentMethods}
        initialVietQrConfig={props.initialVietQrConfig}
      />
    </PosDesktopProvider>
  );
}

/* ─── Inner (consumes hooks) ─── */

function PosDesktopInner({
  categories: initialCategories,
  canCloseShift,
  canConfirmCash,
  canOverrideVariance,
  initialPaymentMethods,
  initialVietQrConfig,
}: {
  categories: MenuCategory[];
  canCloseShift: boolean;
  canConfirmCash: boolean;
  canOverrideVariance: boolean;
  initialPaymentMethods: readonly PaymentMethod[];
  initialVietQrConfig: VietQrConfig | null;
}) {
  const { branchId, session } = usePosSession();
  const orders = usePosOrders();
  const tables = usePosTables();
  const { refreshOrders, refreshOrdersDeduped } = usePosOperationalDispatch();

  // Categories thẳng từ RSC seed, không re-map mỗi event. Daily-limit slice
  // được MenuItemButton tự subscribe qua `useDailyLimit(item.id)` — chỉ card
  // có limit đổi mới re-render thay vì cả grid (Fix#4 B1, Architect option b).
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

  // Cross-tab realtime: khi cashier (hoặc BM) đóng ca từ tab/máy khác,
  // payload UPDATE bay tới đây với `new.status='closed'`. Refresh route
  // để page re-fetch active session — nếu chưa có ca mới, page render
  // SessionGate / "liên hệ thu ngân" tự động.
  //
  // Defense-in-depth (rule REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK):
  // status callback skip lần SUBSCRIBED đầu (state đã seed từ RSC), reload
  // mỗi reconnect sau đó để bắt event missed mid-disconnect.
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

  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  // Tap-to-edit for an item already in the append draft. Mirrors editingCartItem
  // but targets the local appendDraftItems list instead of the cart store —
  // lets the cashier add a note (or change variant/qty) on a row that landed
  // in the draft via the fast no-variant tap path.
  const [editingAppendItem, setEditingAppendItem] = useState<CartItem | null>(
    null,
  );
  // Tap-to-edit cho món ĐÃ GỬI bếp khi status='pending'. Lưu order_item_id
  // riêng để onConfirm gọi editPendingOrderItem (không in-place mutate cart
  // store). seedCartItem chỉ dùng để pre-populate customizer state — KHÔNG
  // ghi vào cart store. Server RPC re-validate status='pending'.
  const [editingSentItem, setEditingSentItem] = useState<{
    orderItemId: number;
    seedCartItem: CartItem;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [billIntent, setBillIntent] = useState<BillReceiptIntent>("payment");
  const [postSubmitPaymentOrderId, setPostSubmitPaymentOrderId] = useState<
    number | null
  >(null);
  // Seed passed to BillReceipt when we just came from OrderDetailSheet
  // on the same order — lets BillReceipt skip its own fetch. Null for
  // bill opens from any other path (toast action, order-list direct
  // open) so BillReceipt falls back to fetchOrderForBill(orderId).
  const [billInitialOrder, setBillInitialOrder] = useState<OrderData | null>(
    null,
  );
  // Header-only seed cho non-detail bill paths (F9 / list / picker / post-
  // submit toast). `usePosOrders()` đã có sẵn snapshot `SessionOrder` —
  // derive thay vì thêm state. BillReceipt dùng để paint dialog title (số
  // đơn + total) ngay khi mở, fetch full bill chạy nền.
  const billHeaderSeed = useMemo<SessionOrder | null>(
    () =>
      billOrderId !== null
        ? (orders.find((order) => order.id === billOrderId) ?? null)
        : null,
    [billOrderId, orders],
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
  const [archivedSheetOpen, setArchivedSheetOpen] = useState(false);
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
    setEditingAppendItem(null);
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
          ).sort(compareOrdersByNextAction)
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
        setEditingAppendItem(null);
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

  const handlePayOrderFromPicker = useCallback(
    (orderId: number) => {
      setPickerTableId(null);
      setCartDrawerOpen(false);
      setPostSubmitPaymentOrderId(null);
      setBillInitialOrder(null);
      setBillIntent("payment");
      setBillOrderId(orderId);
    },
    [],
  );

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
      const cartSnapshot = cartStore.getSnapshot();
      const submittedOrderType = cartSnapshot.orderType;
      const result = await submitPosOrderWithRetry({
        branchId,
        sessionId: session.id,
        cartSnapshot,
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
        if (submittedOrderType === "takeaway") {
          setPostSubmitPaymentOrderId(orderId);
          setShowOrders(false);
          setCartDrawerOpen(false);
          setOrderDetailId(null);
          setOrderDetailNumber(null);
          setOrderDetailSeed(null);
          setOrderDetailSummary(null);
          setActiveTable(null);
          // Reset orderType về home (dine_in nếu có bàn, ngược lại giữ takeaway)
          // → trang nhảy về "Chọn bàn | Mang về" đối xứng với flow dine_in.
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
  }, [
    canSubmit,
    branchId,
    cartStore,
    clearCart,
    selectedTableId,
    setActiveTable,
    setCartOrderType,
    session.id,
    tables,
    focusOrderWorkflow,
    refreshOperational,
    router,
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
          setEditingAppendItem(null);
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
        setEditingAppendItem(null);
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

      setEditingAppendItem(null);
      setEditingCartItem(cartItem);
      setCustomizerItem(menuItem);
    },
    [menuItemById],
  );

  // OrderDetailSheet → "Sửa món" tap. Lookup MenuItem từ menuItemById
  // (nếu menu thay đổi/đã reload, item.menu_item_id có thể không còn) +
  // construct seedCartItem từ row snapshot để customizer pre-populate state.
  // Server-side guard re-validates status='pending'; UI gate là UX hint.
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
      // Clear other editing modes — chỉ 1 customizer flow active một lúc.
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
    ) => {
      // edit-sent: call server action — không in-place mutate cart store.
      // Đặt branch này TRƯỚC editingCartItem/editingAppendItem để safety:
      // editingSentItem chỉ set khi parent gọi handleStartEditSent.
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
            if (r.data?.wasSentToKitchen) {
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

      if (editingAppendItem) {
        if (appendSubmitting) {
          toast.message("Đang gửi món thêm, vui lòng chờ...");
          return;
        }
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
      editingAppendItem,
      editingCartItem,
      editingSentItem,
      refreshOperational,
      replaceCartItems,
    ],
  );

  const openBill = useCallback(
    (id: number, intent: BillReceiptIntent = "payment", seed?: OrderData) => {
      setCartDrawerOpen(false);
      setPostSubmitPaymentOrderId(null);
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

  // Single source for F9 hotkey + mobile pay-quick-tap. Memoized so the
  // boolean prop fed to PosMobileActionBar doesn't flip identity on every
  // realtime tick where orders changed but the awaiting slice did not.
  const latestAwaitingPaymentOrderId = useMemo<number | null>(() => {
    if (postSubmitPaymentOrderId !== null) return postSubmitPaymentOrderId;

    const awaiting = orders
      .filter(isOrderAwaitingPayment)
      .sort(compareOrdersByNextAction)[0];
    return awaiting?.id ?? null;
  }, [orders, postSubmitPaymentOrderId]);

  useEffect(() => {
    if (postSubmitPaymentOrderId === null) return;

    const promptOrder = orders.find(
      (order) => order.id === postSubmitPaymentOrderId,
    );
    if (promptOrder && !isOrderAwaitingPayment(promptOrder)) {
      setPostSubmitPaymentOrderId(null);
    }
  }, [orders, postSubmitPaymentOrderId]);

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
        if (latestAwaitingPaymentOrderId !== null) {
          openBill(latestAwaitingPaymentOrderId);
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

  // Memo so memo'd children (TabbedSidebar / SplitSidebar / PosSidebarContent)
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
        target: appendTarget,
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
    }),
    [
      showOrders,
      canSubmit,
      isPending,
      appendTarget,
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
    ],
  );

  const serviceModeSelector = (
    <ToggleGroup
      type="single"
      value={cartOrderType}
      className="grid h-10 w-full grid-cols-2 overflow-hidden !rounded-none bg-muted/60"
      aria-label={messages.pos.desktop.serviceModeAria}
      onValueChange={(value) => {
        if (value === "dine_in" || value === "takeaway") {
          handleOrderTypeChange(value);
        }
      }}
    >
      <ToggleGroupItem
        value="dine_in"
        className="h-full min-w-0 justify-center !rounded-none border-r border-border px-0 text-sm font-semibold text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
        disabled={cartItemCount > 0 && cartOrderType !== "dine_in"}
      >
        {messages.pos.desktop.dineIn}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="takeaway"
        className="h-full min-w-0 justify-center !rounded-none px-0 text-sm font-semibold text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
        disabled={cartItemCount > 0 && cartOrderType !== "takeaway"}
      >
        {messages.pos.desktop.takeaway}
      </ToggleGroupItem>
    </ToggleGroup>
  );

  const appendBannerRow =
    appendTarget != null ? (
      <div
        role="status"
        className="flex items-center justify-between gap-2 border-b border-warning/20 bg-warning/10 px-4 py-3"
      >
        <p className="min-w-0 text-base leading-6 text-foreground">
          <span className="font-semibold">
            {messages.pos.desktop.appendBannerTitle(appendTarget.orderNumber)}
          </span>
          <span className="text-muted-foreground">
            {""}
            {appendDraftQuantity > 0
              ? messages.pos.desktop.appendPending(appendDraftQuantity)
              : messages.pos.desktop.appendInstruction}
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
          {ACTIONS_VI.cancel}
        </Button>
      </div>
    ) : null;

  const mobileHeaderContextLabel = menuContextReady
    ? appendTarget != null
      ? messages.pos.desktop.mobileHeaderAppend(appendTarget.orderNumber)
      : cartOrderType === "takeaway"
        ? messages.pos.desktop.takeaway
        : messages.pos.desktop.mobileHeaderTable(selectedTableNumber ?? "")
    : undefined;

  // Back-to-main handler: dine_in → clear table → table gate; takeaway →
  // flip mode → table gate. Wired to mobile header back arrow (next to số
  // bàn) — bottom action bar không còn "Đổi bàn" để cashier khỏi với xa.
  const handleSwitchTableMode = useCallback(() => {
    if (cartOrderType === "dine_in") {
      setShowOrders(false);
      setCartDrawerOpen(false);
      setActiveTable(null);
      return;
    }
    if (cartItemCount > 0) {
      toast.message("Giỏ đang có món — xoá giỏ rồi mới đổi sang Tại bàn.");
      setShowOrders(false);
      setCartDrawerOpen(true);
      return;
    }
    setShowOrders(false);
    setCartDrawerOpen(false);
    handleOrderTypeChange("dine_in");
  }, [cartItemCount, cartOrderType, handleOrderTypeChange, setActiveTable]);

  const mobileSidebarDrawer = isMobile ? (
    <Drawer
      open={cartDrawerOpen}
      onOpenChange={setCartDrawerOpen}
      shouldScaleBackground={false}
    >
      <DrawerContent
        showHandle
        className="h-dvh max-h-dvh p-0 data-[vaul-drawer-direction=bottom]:top-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh before:inset-0 before:rounded-none before:border-0 before:bg-background sm:h-5/6 sm:p-2 sm:before:inset-2 sm:before:rounded-xl sm:before:border sm:before:bg-popover"
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

  // Mobile uses `mobileSidebarDrawer` exclusively — skip the desktop sidebars
  // entirely so phones don't carry hidden-via-Tailwind subtrees that still
  // re-render on every realtime tick. `useIsMobile()` returns false during
  // SSR/first paint (initial state is undefined → !!undefined === false), so
  // desktop hydration is unaffected; mobile post-mount unmounts cleanly.
  const sidebars = isMobile ? null : (
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
          contextLabel={mobileHeaderContextLabel}
          onBack={
            orderContextReady && !isAppendingToOrder
              ? handleSwitchTableMode
              : undefined
          }
        />
      </div>

      {!menuContextReady ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appendBannerRow}
            <div className="border-b border-border/60 bg-background p-0 md:hidden">
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
            <MenuPane categories={categories} onItemTap={handleItemTap} />
          </div>
          {sidebars}
        </div>
      )}

      <PosMobileActionBar
        isMobile={isMobile}
        isAppendingToOrder={isAppendingToOrder}
        menuContextReady={menuContextReady}
        cartQuantity={cartQuantity}
        appendDraftQuantity={appendDraftQuantity}
        ordersCount={orders.length}
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
          editingSentItem?.seedCartItem ??
          editingCartItem ??
          editingAppendItem
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
          // Close detail trước rồi mới mở customizer — tránh stack 2 sheet
          // trên mobile (focus trap fight). Snapshot the detail context
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
        onOrderUpdated={() => void refreshOperational()}
      />

      <CloseSessionSheet
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
        canOverrideVariance={canOverrideVariance}
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
        onOrderUpdated={() => void refreshOperational()}
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
