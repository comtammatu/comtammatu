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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  IconLayoutGrid,
  IconReceipt,
  IconShoppingCart,
  IconAlertTriangle,
  IconX,
} from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";

import { ItemCustomizer } from "../pos/item-customizer";
import { CloseSessionDialog } from "../pos/close-session-dialog";
import { BillReceipt } from "../pos/bill-receipt";
import { OrderDetailSheet } from "../pos/order-detail-sheet";
import { PosSessionHeader } from "../pos/pos-session-header";
import { PosMenuGrid } from "../pos/pos-menu-grid";
import { submitOrder, appendOrderItems } from "../pos/actions";
import type {
  CartItem,
  CartModifier,
  CartSide,
  OrderType,
} from "../pos/types";
import type { MenuCategory, MenuItem } from "../pos/pos-menu-types";
import type { BranchTable, ActiveSession } from "../pos/page";
import type { SessionOrder } from "../pos/order-history";

import { useRealtimeOrders } from "./_lib/use-realtime-orders";
import { usePosUrlState } from "./_lib/use-pos-url-state";
import { usePosCart, makeCartKey } from "./_lib/use-pos-cart";
import { TableMapSheet } from "./_components/table-map-sheet";
import { PosV2Sidebar } from "./_components/pos-v2-sidebar";

interface PosMenuV2Props {
  branchId: number;
  categories: MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
  initialOrders: SessionOrder[];
  initialTableId?: number;
  initialOrderType: OrderType;
}

export function PosMenuV2({
  branchId,
  categories,
  tables: initialTables,
  session,
  initialOrders,
  initialTableId,
  initialOrderType,
}: PosMenuV2Props) {
  const isMobile = useIsMobile();

  const urlState = usePosUrlState();
  const cart = usePosCart();
  const { orders, tables, refresh, refreshToken } = useRealtimeOrders({
    branchId,
    sessionId: session.id,
    initialOrders,
    initialTables,
  });

  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [tableSheetOpen, setTableSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const rememberTrigger = useCallback((el: HTMLElement | null) => {
    lastTriggerRef.current = el;
  }, []);
  const returnFocus = useCallback(() => {
    if (lastTriggerRef.current) {
      const el = lastTriggerRef.current;
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  const seededTableRef = useRef(false);
  useEffect(() => {
    if (seededTableRef.current) return;
    seededTableRef.current = true;
    if (initialTableId != null && urlState.tableId == null) {
      const t = initialTables.find((x) => x.id === initialTableId);
      if (t && t.status === "available") urlState.setTableId(initialTableId);
    }
  }, [initialTableId, initialTables, urlState]);

  const selectedTableId = urlState.tableId;
  const selectedTable = useMemo(
    () =>
      selectedTableId != null
        ? (tables.find((t) => t.id === selectedTableId) ?? null)
        : null,
    [tables, selectedTableId],
  );
  const selectedTableAvailable = selectedTable?.status === "available";
  const selectedTableNumber = selectedTable?.number;
  const needsTable = orderType === "dine_in" && !selectedTableAvailable;

  const appendOrderId = urlState.appendOrderId;
  const appendOrder = useMemo(
    () =>
      appendOrderId != null
        ? (orders.find((o) => o.id === appendOrderId) ?? null)
        : null,
    [orders, appendOrderId],
  );

  useEffect(() => {
    if (
      orderType === "dine_in" &&
      selectedTableId != null &&
      selectedTable != null &&
      selectedTable.status !== "available"
    ) {
      urlState.setTableId(null);
    }
  }, [orderType, selectedTable, selectedTableId, urlState]);

  const handleOrderTypeChange = useCallback(
    (type: OrderType) => {
      setOrderType(type);
      if (type === "takeaway") urlState.setTableId(null);
    },
    [urlState],
  );

  const activeSessionOrders = useMemo(
    () =>
      orders.filter((o) =>
        ["new", "confirmed", "preparing", "ready", "served"].includes(o.status),
      ),
    [orders],
  );

  const canSubmit =
    cart.items.length > 0 &&
    (orderType === "takeaway" || selectedTableAvailable);

  const focusOrderWorkflow = useCallback(
    (orderId: number) => {
      urlState.setTab("orders");
      urlState.openDetail(orderId);
      setCartDrawerOpen(false);
    },
    [urlState],
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
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        result = await submitOrder(
          branchId,
          {
            items: cart.items,
            order_type: orderType,
            table_id: selectedTableId ?? undefined,
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
        cart.clear();
        focusOrderWorkflow(orderId);
        urlState.setTableId(null);
        void refresh();
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [
    canSubmit,
    branchId,
    cart,
    orderType,
    selectedTableId,
    session.id,
    urlState,
    focusOrderWorkflow,
    refresh,
  ]);

  const handleItemTap = useCallback(
    (item: MenuItem) => {
      if (appendOrder) {
        setCustomizerItem(item);
        return;
      }
      setCustomizerItem(item);
    },
    [appendOrder],
  );

  const handleCustomizerConfirm = useCallback(
    (
      item: MenuItem,
      variantId: number | undefined,
      variantName: string | undefined,
      unitPrice: number,
      modifiers: CartModifier[],
      sides: CartSide[],
    ) => {
      if (appendOrder) {
        startTransition(async () => {
          const key = makeCartKey(item.id, variantId, modifiers, sides);
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
          };
          const r = await appendOrderItems(branchId, appendOrder.id, [line]);
          if (r.success) {
            toast.success(`Đã thêm món vào đơn #${appendOrder.order_number}`);
            urlState.clearAppend();
            setCustomizerItem(null);
            focusOrderWorkflow(appendOrder.id);
            void refresh();
          } else {
            toast.error(r.error ?? "Không thể thêm món");
          }
        });
        return;
      }
      cart.addItem(item, variantId, variantName, unitPrice, modifiers, sides);
      setCustomizerItem(null);
      if (isMobile) {
        urlState.setTab("cart");
      }
    },
    [appendOrder, branchId, cart, focusOrderWorkflow, isMobile, refresh, urlState],
  );

  const openTableSheet = useCallback((trigger?: HTMLElement | null) => {
    if (trigger) rememberTrigger(trigger);
    setTableSheetOpen(true);
  }, [rememberTrigger]);

  const sidebar = (
    <PosV2Sidebar
      tab={urlState.tab}
      onTabChange={(t) => urlState.setTab(t)}
      cartItems={cart.items}
      cartTotal={cart.total}
      cartQuantity={cart.quantity}
      orderType={orderType}
      selectedTableId={selectedTableId}
      tables={tables}
      canSubmit={canSubmit}
      isPending={isPending}
      sessionOrders={orders}
      orderNote={cart.note}
      onIncrement={(key) => cart.updateQuantity(key, 1)}
      onDecrement={(key) => cart.updateQuantity(key, -1)}
      onRemoveItem={cart.removeItem}
      onClearCart={cart.clear}
      onOrderTypeChange={handleOrderTypeChange}
      onRequestChangeTable={() => openTableSheet()}
      onSubmitOrder={handleSubmitOrder}
      onOrderNoteChange={cart.setNote}
      onViewBill={(id) => {
        setCartDrawerOpen(false);
        setBillOrderId(id);
      }}
      onViewDetail={(id) => {
        setCartDrawerOpen(false);
        urlState.openDetail(id);
      }}
    />
  );

  const appendBanner = appendOrder ? (
    <div className="border-b border-warning/15 bg-warning/10 px-3 py-3 md:px-4" role="status">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="rounded-xl border border-warning/20 bg-warning/10 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm leading-6">
              <span className="font-semibold">
                Thêm món vào đơn #{appendOrder.order_number}
              </span>
              <span className="text-muted-foreground">
                {" "}
                — Chọn món để tiếp tục thêm vào đơn.
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 h-9 shrink-0 gap-1 rounded-full px-3 text-xs hover:bg-warning/25"
              onClick={urlState.clearAppend}
            >
              <IconX className="size-3.5" />
              Hủy
            </Button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const tableBanner = needsTable ? (
    <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-3 md:px-4" role="status">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold text-destructive">Chưa chọn bàn.</span>{" "}
            <span className="text-muted-foreground">
              Đơn tại bàn cần có bàn trước khi gửi bếp.
            </span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="min-h-11 shrink-0 gap-1.5 rounded-full px-4"
          onClick={(e) => openTableSheet(e.currentTarget)}
        >
          <IconLayoutGrid className="size-4" />
          Chọn bàn
        </Button>
      </div>
    </div>
  ) : null;

  const quickTableButton =
    orderType === "dine_in" ? (
      <Button
        variant="outline"
        size="sm"
        type="button"
        className="min-h-11 gap-1.5 rounded-full"
        onClick={(e) => openTableSheet(e.currentTarget)}
        aria-label="Mở sơ đồ bàn"
      >
        <IconLayoutGrid className="size-4" />
        {selectedTableNumber != null ? `Bàn ${String(selectedTableNumber)}` : "Chọn bàn"}
      </Button>
    ) : null;

  const mobileActionBar = isMobile ? (
    <div className="fixed bottom-4 left-4 right-4 z-40 flex gap-2 md:hidden">
      {activeSessionOrders.length > 0 && (
        <Button
          type="button"
          variant="secondary"
          className="min-h-14 min-w-14 flex-1 rounded-full text-sm font-bold shadow-lg"
          onClick={(e) => {
            rememberTrigger(e.currentTarget);
            urlState.setTab("orders");
            void refresh();
            setCartDrawerOpen(true);
          }}
        >
          <IconReceipt className="size-5" />
          <span>{activeSessionOrders.length}</span>
        </Button>
      )}
      <Button
        type="button"
        className="min-h-14 min-w-14 flex-1 rounded-full text-sm font-bold shadow-lg"
        onClick={(e) => {
          rememberTrigger(e.currentTarget);
          urlState.setTab("cart");
          setCartDrawerOpen(true);
        }}
        aria-label="Mở giỏ hàng"
      >
        <IconShoppingCart className="size-5" />
        {cart.quantity > 0 ? (
          <>
            <span className="tabular-nums">{cart.quantity}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatVND(cart.total)}</span>
          </>
        ) : (
          <span>Giỏ mới</span>
        )}
      </Button>
    </div>
  ) : null;

  const mobileSidebarDrawer = isMobile ? (
    <Drawer
      open={cartDrawerOpen}
      onOpenChange={(open) => {
        setCartDrawerOpen(open);
        if (!open) returnFocus();
      }}
      shouldScaleBackground={false}
    >
      <DrawerContent className="max-h-dvh p-0">
        <DrawerTitle className="sr-only">
          {urlState.tab === "orders" ? "Đơn đang phục vụ" : "Giỏ hàng"}
        </DrawerTitle>
        <div className="flex min-h-0 flex-col overflow-hidden">{sidebar}</div>
      </DrawerContent>
    </Drawer>
  ) : null;

  return (
    <>
      <PosSessionHeader
        session={session}
        branchId={branchId}
        orderType={orderType}
        selectedTableNumber={selectedTableNumber}
        activeOrderCount={activeSessionOrders.length}
        onShowCloseSession={() => setShowCloseSession(true)}
      />

      {quickTableButton != null && (
        <div className="border-b border-border/60 bg-background px-3 py-2 md:px-4">
          <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-end gap-2">
            {quickTableButton}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
        <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-screen-2xl flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {appendBanner}
            {tableBanner}
            <PosMenuGrid
              categories={categories}
              cartQuantity={cart.quantity}
              cartTotal={cart.total}
              orderType={orderType}
              selectedTableNumber={selectedTableNumber}
              onItemTap={handleItemTap}
              showHeaderBadges={false}
            />
          </div>

          <aside
            className="hidden w-80 shrink-0 flex-col overflow-hidden border-l border-border/60 bg-background md:flex xl:w-96"
            aria-label="Giỏ và đơn đang phục vụ"
          >
            {sidebar}
          </aside>
        </div>
      </div>

      {mobileActionBar}
      {mobileSidebarDrawer}

      <TableMapSheet
        open={tableSheetOpen}
        onOpenChange={(o) => {
          setTableSheetOpen(o);
          if (!o) returnFocus();
        }}
        tables={tables}
        selectedTableId={selectedTableId}
        onSelect={(id) => {
          setOrderType("dine_in");
          urlState.setTableId(id);
        }}
      />

      <ItemCustomizer
        item={customizerItem}
        onClose={() => setCustomizerItem(null)}
        onConfirm={handleCustomizerConfirm}
        mode={appendOrder ? "append" : "new"}
        appendOrderLabel={appendOrder?.order_number ?? null}
      />

      <OrderDetailSheet
        orderId={urlState.detailOrderId}
        refreshToken={refreshToken}
        onClose={urlState.closeDetail}
        onAfterClose={returnFocus}
        onOpenBill={(id) => {
          urlState.closeDetail();
          setCartDrawerOpen(false);
          setBillOrderId(id);
        }}
        onStartAppend={(oid) => {
          setCartDrawerOpen(false);
          urlState.startAppend(oid);
          toast.message("Chọn món trên menu để thêm vào đơn");
        }}
        onReorderToCart={(items, skippedCount) => {
          cart.setItems(items);
          urlState.setTab("cart");
          if (skippedCount > 0) {
            toast.message(
              `Đã bỏ qua ${String(skippedCount)} món không còn trong thực đơn hoặc đã thay đổi giá.`,
            );
          } else {
            toast.success("Đã thêm món vào giỏ từ đơn cũ");
          }
        }}
        tables={tables}
        onOrderUpdated={() => void refresh()}
      />

      <CloseSessionDialog
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      <BillReceipt
        branchId={branchId}
        orderId={billOrderId}
        onOrderUpdated={() => void refresh()}
        onClose={() => setBillOrderId(null)}
      />

    </>
  );
}
