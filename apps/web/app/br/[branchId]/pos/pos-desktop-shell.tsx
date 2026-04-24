"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
import {
  IconKeyboard,
  IconLayoutGrid,
  IconPackage,
  IconReceipt,
  IconShoppingCart,
  IconToolsKitchen,
  IconX,
} from "@tabler/icons-react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { PosTableGate } from "./pos-table-gate";
import { ItemCustomizer } from "./item-customizer";
import { CloseSessionSheet } from "./close-session-sheet";
import { BillReceipt } from "./_components/bill/bill-receipt-sheet";
import { OrderDetailSheet } from "./order-detail-sheet";
import { PosSessionHeader } from "./pos-session-header";
import { MenuPane } from "./_components/menu-pane";
import { CartPane } from "./_components/cart-pane";
import { OrderListPane } from "./_components/order-list-pane";
import { PosSidebarTabs, PosSidebarContent } from "./pos-sidebar-panel";
import { HotkeyOverlay } from "./_components/hotkey-overlay";
import {
  submitOrder,
  appendOrderItems,
  fetchActiveOrderForTable,
} from "./actions";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { ActiveSession, BranchTable } from "./page";
import {
  PosDesktopProvider,
  usePosOperationalData,
  usePosOperationalDispatch,
  usePosSession,
} from "./_providers/pos-desktop-provider";
import { useCart } from "./_hooks/use-cart";
import { useActiveTable } from "./_hooks/use-active-table";
import { useAppendTarget } from "./_hooks/use-append-target";
import { makeCartKey, makeNotedCartKey } from "./_utils/cart-key";

interface PosDesktopShellProps {
  branchId: number;
  categories: MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
  initialOrderType: OrderType;
}

export function PosDesktopShell(props: PosDesktopShellProps) {
  return (
    <PosDesktopProvider
      branchId={props.branchId}
      session={props.session}
      initialTables={props.tables}
      initialOrderType={props.initialOrderType}
    >
      <PosDesktopInner categories={props.categories} />
    </PosDesktopProvider>
  );
}

/* ─── Inner (consumes hooks) ─── */

function PosDesktopInner({ categories }: { categories: MenuCategory[] }) {
  const { branchId, session } = usePosSession();
  const { orders, tables } = usePosOperationalData();
  const { refreshAll, refreshOrders } = usePosOperationalDispatch();
  const cart = useCart();
  const activeTable = useActiveTable();
  const appendMode = useAppendTarget();

  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [minimizedBills, setMinimizedBills] = useState<
    { orderId: number; paymentId: number }[]
  >([]);

  const handleBillMinimize = useCallback(
    (oid: number, pid: number) => {
      setMinimizedBills((prev) =>
        prev.some((b) => b.orderId === oid)
          ? prev
          : [...prev, { orderId: oid, paymentId: pid }],
      );
      setBillOrderId(null);
    },
    [],
  );

  const restoreMinimizedBill = useCallback((oid: number) => {
    setMinimizedBills((prev) => prev.filter((b) => b.orderId !== oid));
    setBillOrderId(oid);
  }, []);
  const [orderDetailId, setOrderDetailId] = useState<number | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);
  const [hotkeyOpen, setHotkeyOpen] = useState(false);
  const isMobile = useIsMobile();

  const bumpDetailRefresh = useCallback(() => {
    setDetailRefreshTick((t) => t + 1);
  }, []);

  const refreshOperational = useCallback(async () => {
    await refreshAll();
    bumpDetailRefresh();
  }, [refreshAll, bumpDetailRefresh]);

  // Clear selected table if it becomes unavailable while in dine-in mode.
  useEffect(() => {
    if (
      cart.orderType === "dine_in" &&
      activeTable.tableId !== null &&
      activeTable.table != null &&
      activeTable.table.status !== "available"
    ) {
      activeTable.setTable(null);
    }
  }, [cart.orderType, activeTable]);

  const selectedTableAvailable = activeTable.isAvailable;
  const orderContextReady =
    cart.orderType === "takeaway" || selectedTableAvailable;
  const selectedTableNumber = activeTable.table?.number;

  const activeSessionOrders = useMemo(
    () =>
      orders.filter((order) =>
        ["new", "confirmed", "preparing", "ready", "served"].includes(
          order.status,
        ),
      ),
    [orders],
  );

  const hasAwaitingPaymentOrder = useMemo(
    () =>
      orders.some(
        (order) => order.status === "served" && order.payment_status !== "paid",
      ),
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
    cart.items.length > 0 &&
    (cart.orderType === "takeaway" || selectedTableAvailable);

  const focusOrderWorkflow = useCallback((orderId: number) => {
    setShowOrders(true);
    setOrderDetailId(orderId);
    setCartDrawerOpen(false);
  }, []);

  const handleTableSelect = useCallback(
    (table: BranchTable) => {
      if (table.status === "available") {
        activeTable.setTable(activeTable.tableId === table.id ? null : table.id);
        return;
      }

      if (table.status !== "occupied") {
        toast.message("Bàn này chưa sẵn sàng để nhận order.");
        return;
      }

      startTransition(async () => {
        const result = await fetchActiveOrderForTable(branchId, table.id);
        if (result.success && result.data) {
          focusOrderWorkflow(result.data.id);
          void refreshOperational();
          return;
        }

        toast.error(
          result.error ?? "Chưa tìm thấy đơn đang phục vụ của bàn này.",
        );
        void refreshOperational();
      });
    },
    [activeTable, branchId, focusOrderWorkflow, refreshOperational, startTransition],
  );

  const handleRequestChangeTable = useCallback(() => {
    activeTable.setTable(null);
  }, [activeTable]);

  const handleOrderTypeChange = useCallback(
    (type: OrderType) => {
      if (
        type !== cart.orderType &&
        (cart.items.length > 0 || activeTable.tableId !== null)
      ) {
        return;
      }

      cart.setOrderType(type);
      if (type === "takeaway") {
        activeTable.setTable(null);
      }
    },
    [cart, activeTable],
  );

  const handleSubmitOrder = useCallback(() => {
    if (!canSubmit) return;

    startTransition(async () => {
      const idempotencyKey = crypto.randomUUID();
      const backoffMs = [0, 400, 1000] as const;

      let result: Awaited<ReturnType<typeof submitOrder>> = {
        success: false,
        error: "Không thể tạo đơn hàng",
      };

      for (const delay of backoffMs) {
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        result = await submitOrder(
          branchId,
          {
            items: cart.items,
            order_type: cart.orderType,
            table_id: activeTable.tableId ?? undefined,
            note: cart.note.trim() || undefined,
          },
          session.id,
          idempotencyKey,
        );
        if (result.success) break;
        const err = result.error ?? "";
        if (
          err.includes("Giỏ hàng") ||
          err.includes("không hợp lệ") ||
          err.includes("quyền") ||
          err.includes("Phiên đăng nhập") ||
          err.includes("chi nhánh")
        ) {
          break;
        }
      }

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

        cart.clear();
        focusOrderWorkflow(orderId);
        activeTable.setTable(null);
        void refreshOperational();
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [
    canSubmit,
    branchId,
    cart,
    activeTable,
    session.id,
    focusOrderWorkflow,
    refreshOperational,
  ]);

  const handleItemTap = useCallback(
    (item: MenuItem) => {
      const hasVariants = item.menu_item_variants.length > 0;
      const hasModifiers = item.menu_item_modifiers.length > 0;
      const hasSides = item.menu_item_available_sides.length > 0;

      if (appendMode.target) {
        if (hasVariants || hasModifiers || hasSides) {
          setCustomizerItem(item);
        } else {
          const target = appendMode.target;
          startTransition(async () => {
            const key = makeCartKey(item.id, undefined, [], []);
            const line: CartItem = {
              key,
              menu_item_id: item.id,
              item_name: item.name,
              quantity: 1,
              unit_price: item.base_price,
              modifiers: [],
              sides: [],
            };
            const r = await appendOrderItems(branchId, target.orderId, [line]);
            if (r.success) {
              toast.success(`Đã thêm món vào đơn #${target.orderNumber}`);
              const kw = r.meta?.kitchenWarning;
              if (typeof kw === "string") toast.warning(kw);
              appendMode.clear();
              focusOrderWorkflow(target.orderId);
              void refreshOperational();
            } else {
              toast.error(r.error ?? "Không thể thêm món");
            }
          });
        }
        return;
      }

      if (hasVariants || hasModifiers || hasSides) {
        setCustomizerItem(item);
      } else {
        setShowOrders(false);
        cart.addItem(item);
      }
    },
    [appendMode, branchId, cart, focusOrderWorkflow, refreshOperational],
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
    ) => {
      if (appendMode.target) {
        const target = appendMode.target;
        startTransition(async () => {
          const hasNote = note !== undefined && note.length > 0;
          const baseKey = makeCartKey(item.id, variantId, modifiers, sides);
          const key = hasNote ? makeNotedCartKey(baseKey) : baseKey;
          const line: CartItem = {
            key,
            menu_item_id: item.id,
            item_name: item.name,
            variant_id: variantId,
            variant_name: variantName,
            quantity: 1,
            unit_price: unitPrice,
            modifiers,
            sides,
            note,
          };
          const r = await appendOrderItems(branchId, target.orderId, [line]);
          if (r.success) {
            toast.success(`Đã thêm món vào đơn #${target.orderNumber}`);
            const kw = r.meta?.kitchenWarning;
            if (typeof kw === "string") toast.warning(kw);
            appendMode.clear();
            setCustomizerItem(null);
            focusOrderWorkflow(target.orderId);
            void refreshOperational();
          } else {
            toast.error(r.error ?? "Không thể thêm món");
          }
        });
        return;
      }
      setShowOrders(false);
      cart.addItem(item, {
        variantId,
        variantName,
        unitPrice,
        modifiers,
        sides,
        note,
      });
      setCustomizerItem(null);
    },
    [appendMode, branchId, cart, focusOrderWorkflow, refreshOperational],
  );

  const openBill = useCallback((id: number) => {
    setCartDrawerOpen(false);
    setBillOrderId(id);
  }, []);

  const openDetail = useCallback((id: number) => {
    setCartDrawerOpen(false);
    setOrderDetailId(id);
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
      handler: () => setShowCloseSession(true),
    },
    {
      key: "F2",
      preventDefault: true,
      handler: () => {
        handleOrderTypeChange(
          cart.orderType === "takeaway" ? "dine_in" : "takeaway",
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
        const awaiting = orders.find(
          (o) => o.status === "served" && o.payment_status !== "paid",
        );
        if (awaiting) {
          openBill(awaiting.id);
        } else {
          toast.message("Không có đơn chờ thanh toán");
        }
      },
    },
  ]);

  const sidebarContentProps = {
    showOrders,
    canSubmit,
    isPending,
    onSubmitOrder: handleSubmitOrder,
    onOrderTypeChange: handleOrderTypeChange,
    onRequestChangeTable: handleRequestChangeTable,
    onViewBill: openBill,
    onViewDetail: openDetail,
  } as const;

  const serviceModeSelector = (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col gap-3 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Loại đơn
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn tại bàn hoặc mang về trước khi tạo đơn mới.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={cart.orderType}
          variant="outline"
          size="lg"
          className="grid w-full grid-cols-2 gap-2"
          onValueChange={(value) => {
            if (value === "dine_in" || value === "takeaway") {
              handleOrderTypeChange(value);
            }
          }}
        >
          <ToggleGroupItem
            value="dine_in"
            className="min-h-11 justify-center gap-2 rounded-lg text-sm font-semibold"
            disabled={cart.items.length > 0 && cart.orderType !== "dine_in"}
          >
            <IconToolsKitchen className="size-4" />
            Tại bàn
          </ToggleGroupItem>
          <ToggleGroupItem
            value="takeaway"
            className="min-h-11 justify-center gap-2 rounded-lg text-sm font-semibold"
            disabled={cart.items.length > 0 && cart.orderType !== "takeaway"}
          >
            <IconPackage className="size-4" />
            Mang về
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );

  const appendBannerRow =
    appendMode.target != null ? (
      <div
        className="border-b border-warning/15 bg-warning/10 px-3 py-3 md:px-4"
        role="status"
      >
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="rounded-xl border border-warning/20 bg-warning/10 shadow-sm p-3">
            <div className="relative flex items-center justify-between gap-2">
              <p className="min-w-0 text-sm leading-6 text-foreground">
                <span className="font-semibold">
                  Thêm món vào đơn #{appendMode.target.orderNumber}
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
                className="min-h-11 min-w-11 h-9 shrink-0 gap-1 rounded-full px-3 text-xs text-foreground hover:bg-warning/25"
                onClick={() => appendMode.clear()}
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
    isMobile && orderContextReady ? (
      <div className="border-b border-border/60 bg-background/75 px-3 py-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ngữ cảnh đơn
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {cart.orderType === "takeaway"
                ? "Mang về"
                : `Bàn ${selectedTableNumber ?? ""}`}
            </p>
          </div>
          {cart.orderType === "takeaway" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 min-w-11 shrink-0 rounded-full px-4 text-xs font-bold"
              disabled={cart.items.length > 0}
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
              className="min-h-11 min-w-11 shrink-0 rounded-full px-4 text-xs font-bold"
              onClick={() => {
                setShowOrders(false);
                setCartDrawerOpen(false);
                activeTable.setTable(null);
              }}
            >
              Đổi bàn
            </Button>
          )}
        </div>
      </div>
    ) : null;

  const mobileActionBar =
    isMobile ? (
      <div className="fixed inset-x-4 bottom-4 z-40 flex gap-2 md:hidden">
        <Button
          type="button"
          variant="secondary"
          className="min-h-14 min-w-14 flex-1 rounded-full text-sm font-bold shadow-lg"
          onClick={() => {
            setShowOrders(true);
            void refreshOrders();
            setCartDrawerOpen(true);
          }}
        >
          <IconReceipt className="size-5" />
          <span>Đơn trong ca</span>
          {orders.length > 0 && (
            <span className="tabular-nums">{orders.length}</span>
          )}
        </Button>
        {orderContextReady &&
          cart.orderType === "dine_in" &&
          activeTable.tableId !== null && (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 min-w-14 rounded-full bg-background px-4 text-sm font-bold shadow-lg"
            onClick={() => {
              setShowOrders(false);
              setCartDrawerOpen(false);
              handleOrderTypeChange("dine_in");
              activeTable.setTable(null);
            }}
            aria-label="Xem bàn"
          >
            <IconLayoutGrid className="size-5" />
          </Button>
        )}
        {orderContextReady && (
          <Button
            type="button"
            className="min-h-14 min-w-14 flex-1 rounded-full text-sm font-bold shadow-lg"
            onClick={() => {
              setShowOrders(false);
              setCartDrawerOpen(true);
            }}
            aria-label="Mở giỏ hàng"
          >
            <IconShoppingCart className="size-5" />
            {cart.quantity > 0 ? (
              <>
                <span>Giỏ</span>
                <span className="tabular-nums">{cart.quantity}</span>
              </>
            ) : (
              <span>Giỏ mới</span>
            )}
          </Button>
        )}
      </div>
    ) : null;

  const mobileSidebarDrawer = isMobile ? (
    <Drawer
      open={cartDrawerOpen}
      onOpenChange={setCartDrawerOpen}
      shouldScaleBackground={false}
    >
      <DrawerContent className="h-5/6 max-h-dvh p-0">
        <DrawerTitle className="sr-only">
          {showOrders ? "Đơn đang phục vụ" : "Giỏ hàng"}
        </DrawerTitle>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <PosSidebarContent {...sidebarContentProps} />
        </div>
      </DrawerContent>
    </Drawer>
  ) : null;

  const tabbedSidebar = (
    <div className="hidden w-96 shrink-0 flex-col border-l border-border/60 bg-background md:flex xl:hidden">
      <PosSidebarTabs
        showOrders={showOrders}
        onShowOrdersChange={setShowOrders}
      />
      <PosSidebarContent {...sidebarContentProps} />
    </div>
  );

  const splitSidebar = (
    <>
      <div className="hidden w-96 shrink-0 flex-col border-l border-border/60 bg-background xl:flex">
        <CartPane
          canSubmit={canSubmit}
          isSubmitting={isPending}
          onSubmitOrder={handleSubmitOrder}
          onOrderTypeChange={handleOrderTypeChange}
          onRequestChangeTable={handleRequestChangeTable}
        />
      </div>
      <div className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background xl:flex 2xl:w-96">
        <OrderListPane onViewBill={openBill} onViewDetail={openDetail} />
      </div>
    </>
  );

  return (
    <>
      <PosSessionHeader
        session={session}
        branchId={branchId}
        orderType={cart.orderType}
        selectedTableNumber={selectedTableNumber}
        activeOrderCount={activeSessionOrders.length}
        onShowCloseSession={() => setShowCloseSession(true)}
      />

      {!orderContextReady ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appendBannerRow}
            <div className="border-b border-border/60 bg-background/75 p-3 md:hidden">
              {serviceModeSelector}
            </div>
            <PosTableGate
              tables={tables}
              selectedTableId={activeTable.tableId}
              onTableSelect={handleTableSelect}
              className="min-h-0 flex-1"
            />
          </div>
          {tabbedSidebar}
          {splitSidebar}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appendBannerRow}
            {mobileOrderContextRow}
            <MenuPane categories={categories} onItemTap={handleItemTap} />
          </div>
          {tabbedSidebar}
          {splitSidebar}
        </div>
      )}

      {mobileActionBar}
      {mobileSidebarDrawer}

      <ItemCustomizer
        item={customizerItem}
        onClose={() => setCustomizerItem(null)}
        onConfirm={handleCustomizerConfirm}
        mode={appendMode.target ? "append" : "new"}
        appendOrderLabel={appendMode.target?.orderNumber ?? null}
      />

      <OrderDetailSheet
        orderId={orderDetailId}
        refreshToken={detailRefreshTick}
        onClose={() => setOrderDetailId(null)}
        onOpenBill={(id) => {
          setOrderDetailId(null);
          setCartDrawerOpen(false);
          setBillOrderId(id);
        }}
        onStartAppend={(oid, onum) => {
          setOrderDetailId(null);
          setCartDrawerOpen(false);
          appendMode.start(oid, onum);
          setShowOrders(false);
          toast.message("Chọn món trên menu để thêm vào đơn");
        }}
        onReorderToCart={(items, skippedCount) => {
          cart.replaceItems(items);
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
        onOrderUpdated={() => void refreshOperational()}
        onClose={() => setBillOrderId(null)}
        onMinimize={handleBillMinimize}
      />

      {minimizedBills.length > 0 && billOrderId === null && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
          {minimizedBills.map((b) => {
            const order = orders.find((o) => o.id === b.orderId);
            const label = order?.order_number ?? String(b.orderId);
            return (
              <Button
                key={b.orderId}
                type="button"
                size="sm"
                variant="secondary"
                className="pointer-events-auto rounded-full px-4 shadow-lg"
                onClick={() => restoreMinimizedBill(b.orderId)}
              >
                Hoá đơn #{label} · đang chờ
              </Button>
            );
          })}
        </div>
      )}

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
