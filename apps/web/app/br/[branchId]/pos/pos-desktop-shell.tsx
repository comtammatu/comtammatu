"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
import { IconKeyboard, IconX } from "@tabler/icons-react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { PosTableGate } from "./pos-table-gate";
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
import type { SessionOrder } from "./order-history";
import type { OrderData } from "./_components/bill/bill-receipt-types";
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
  /** User hiện tại có `pos:close_shift` không (ẩn nút "Chốt ca" với waiter). */
  canCloseShift: boolean;
  /** `pos:confirm_payment` — gate phương thức "Tiền mặt" trên bill (cashier+). */
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
  const { refreshOrders } = usePosOperationalDispatch();
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
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);
  const [hotkeyOpen, setHotkeyOpen] = useState(false);
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
    await refreshOrders();
    bumpDetailRefresh();
  }, [refreshOrders, bumpDetailRefresh]);

  // Clear selected table if it becomes unavailable while in dine-in mode.
  useEffect(() => {
    if (
      cartOrderType === "dine_in" &&
      selectedTableId !== null &&
      selectedTable != null &&
      selectedTable.status !== "available"
    ) {
      setActiveTable(null);
    }
  }, [cartOrderType, selectedTable, selectedTableId, setActiveTable]);

  const orderContextReady =
    cartOrderType === "takeaway" || selectedTableAvailable;
  const isAppendingToOrder = appendTarget != null;
  const menuContextReady = orderContextReady || isAppendingToOrder;
  const selectedTableNumber = selectedTable?.number;

  const hasAwaitingPaymentOrder = useMemo(
    () => orders.some(isOrderAwaitingPayment),
    [orders],
  );

  // Poll for payment-awaiting orders while no bill is actively open.
  useEffect(() => {
    if (!hasAwaitingPaymentOrder || billOrderId !== null) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshOperational();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [billOrderId, hasAwaitingPaymentOrder, refreshOperational]);

  const canSubmit =
    cartItemCount > 0 &&
    (cartOrderType === "takeaway" || selectedTableAvailable);

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
    clearAppendTarget,
    focusOrderWorkflow,
    refreshOperational,
  });

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

      startTransition(async () => {
        const result = await fetchActiveOrderForTable(branchId, table.id);
        if (result.success && result.data) {
          const order = result.data.order as unknown as OrderDetailData;
          // Seed the detail sheet with the already-fetched payload so it
          // renders immediately — no second round-trip for the same row.
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
    },
    [
      branchId,
      focusOrderWorkflow,
      refreshOperational,
      selectedTableId,
      setActiveTable,
      startTransition,
    ],
  );

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
            onClick: () => setBillOrderId(orderId),
          },
        });
        const kitchenWarning = result.meta?.kitchenWarning;
        if (typeof kitchenWarning === "string") {
          toast.warning(kitchenWarning);
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
        if (hasVariants || hasModifiers || hasSides) {
          setEditingCartItem(null);
          setCustomizerItem(item);
        } else {
          const target = appendTarget;
          const line: CartItem = {
            key: makeCartKey(item.id, undefined, [], []),
            menu_item_id: item.id,
            item_name: item.name,
            quantity: 1,
            unit_price: item.base_price,
            modifiers: [],
            sides: [],
          };
          startTransition(() => {
            void performAppend(target, [line]);
          });
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
    [addCartItem, appendTarget, performAppend],
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
        const target = appendTarget;
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
        startTransition(() => {
          void performAppend(target, [line], {
            onSuccess: () => setCustomizerItem(null),
          });
        });
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
      appendTarget,
      cartStore,
      editingCartItem,
      performAppend,
      replaceCartItems,
    ],
  );

  const openBill = useCallback((id: number, seed?: OrderData) => {
    setCartDrawerOpen(false);
    setBillInitialOrder(seed ?? null);
    setBillOrderId(id);
  }, []);

  const closeBill = useCallback(() => {
    setBillOrderId(null);
    setBillInitialOrder(null);
  }, []);

  const openDetail = useCallback((id: number, orderNumber?: string | null) => {
    setCartDrawerOpen(false);
    // Clear any table-tap seed: this path (OrderListPane row tap) only
    // has the id, so OrderDetailSheet must fall back to its own fetch.
    setOrderDetailSeed(null);
    setOrderDetailId(id);
    setOrderDetailNumber(orderNumber ?? null);
  }, []);

  const closeOrderDetail = useCallback(() => {
    setOrderDetailId(null);
    setOrderDetailNumber(null);
    setOrderDetailSeed(null);
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
        <div className="w-full">
          <div className="rounded-xl border border-warning/20 bg-warning/10 shadow-sm p-3">
            <div className="relative flex items-center justify-between gap-2">
              <p className="min-w-0 text-base leading-6 text-foreground">
                <span className="font-semibold">
                  Thêm món vào đơn #{appendTarget.orderNumber}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  Chọn món trên danh sách bên dưới để tiếp tục thêm vào đơn.
                </span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 h-9 shrink-0 gap-1 rounded-full px-3 text-sm text-foreground hover:bg-warning/25"
                onClick={clearAppendTarget}
              >
                <IconX className="size-3.5" />
                Hủy
              </Button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const mobileOrderContextRow =
    isMobile && menuContextReady ? (
      <div className="border-b border-border/60 bg-background/75 px-2 py-2 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
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
                className="min-h-10 min-w-10 shrink-0 rounded-full px-3 text-sm font-bold"
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
                className="min-h-10 min-w-10 shrink-0 rounded-full px-3 text-sm font-bold"
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
        showHandle={false}
        className="h-svh max-h-svh p-0 before:inset-0 before:rounded-none sm:h-5/6 sm:max-h-dvh sm:p-2 sm:before:inset-2 sm:before:rounded-xl"
      >
        <DrawerTitle className="sr-only">
          {showOrders ? "Đơn đang phục vụ" : "Giỏ hàng"}
        </DrawerTitle>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <PosSidebarContent {...sidebarContentProps} />
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
        onClose={closeOrderDetail}
        onOpenBill={(id, seed) => {
          closeOrderDetail();
          openBill(id, seed);
        }}
        onStartAppend={(oid, onum) => {
          closeOrderDetail();
          setCartDrawerOpen(false);
          startAppendTarget(oid, onum);
          setShowOrders(false);
          toast.message("Chọn món trên menu để thêm vào đơn");
        }}
        onReorderToCart={(items, skippedCount) => {
          replaceCartItems(items);
          setShowOrders(false);
          if (skippedCount > 0) {
            toast.message(
              `Đã bỏ qua ${String(skippedCount)} món không còn trong thực đơn.`,
            );
          } else {
            toast.success("Đã thêm món vào giỏ từ đơn cũ");
          }
        }}
        tables={tables}
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
        initialOrder={billInitialOrder}
        canConfirmCash={canConfirmCash}
        onOrderUpdated={() => void refreshOperational()}
        onClose={closeBill}
      />

      <HotkeyOverlay open={hotkeyOpen} onOpenChange={setHotkeyOpen} />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed bottom-4 left-4 z-40 hidden size-10 rounded-full shadow-lg md:inline-flex"
        aria-label="Mở phím tắt (?)"
        title="Phím tắt (?)"
        onClick={() => setHotkeyOpen(true)}
      >
        <IconKeyboard className="size-5" />
      </Button>
    </>
  );
}
