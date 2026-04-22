"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Package,
  ShoppingCart,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { PosTableGate } from "./pos-table-gate";
import { ItemCustomizer } from "./item-customizer";
import { CloseSessionDialog } from "./close-session-dialog";
import { BillReceipt } from "./bill-receipt";
import { OrderDetailSheet } from "./order-detail-sheet";
import { PosSessionHeader } from "./pos-session-header";
import { PosMenuGrid } from "./pos-menu-grid";
import { PosSidebarTabs, PosSidebarContent } from "./pos-sidebar-panel";
import {
  submitOrder,
  fetchSessionOrders,
  appendOrderItems,
  fetchTablesForBranch,
} from "./actions";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import { calcCartTotal } from "./types";
import type { BranchTable, ActiveSession } from "./page";
import type { SessionOrder } from "./order-history";

/* ─── Re-exports for external consumers ─── */
export type {
  MenuVariant,
  MenuModifier,
  MenuAvailableSide,
  MenuItem,
  MenuCategory,
} from "./pos-menu-types";

/* ─── Helpers ─── */

function makeCartKey(
  itemId: number,
  variantId: number | undefined,
  modifiers: CartModifier[],
  sides: CartSide[],
): string {
  const modIds = modifiers
    .map((m) => m.modifier_id)
    .sort((a, b) => a - b)
    .join(",");
  const sideIds = sides
    .map((s) => s.side_item_id)
    .sort((a, b) => a - b)
    .join(",");
  return `${String(itemId)}-${String(variantId ?? 0)}-${modIds}-${sideIds}`;
}

/* ─── Component ─── */

interface PosMenuProps {
  branchId: number;
  categories: import("./pos-menu-types").MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
  /** From URL `?table=` — preselect dine-in table when valid */
  initialTableId?: number;
  /** From server: `dine_in` when `?table=` matches a non-maintenance table; else `takeaway` */
  initialOrderType: OrderType;
}

export function PosMenu({
  branchId,
  categories,
  tables: initialTables,
  session,
  initialTableId,
  initialOrderType,
}: PosMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customizerItem, setCustomizerItem] = useState<import("./pos-menu-types").MenuItem | null>(null);
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [orderDetailId, setOrderDetailId] = useState<number | null>(null);
  const [orderNote, setOrderNote] = useState("");
  const [appendTarget, setAppendTarget] = useState<{
    orderId: number;
    orderNumber: string;
  } | null>(null);
  const [localTables, setLocalTables] = useState<BranchTable[]>(initialTables);
  const [operationalRefreshTick, setOperationalRefreshTick] = useState(0);
  const [sessionOrders, setSessionOrders] = useState<SessionOrder[]>([]);
  const [showOrders, setShowOrders] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setLocalTables(initialTables);
  }, [initialTables]);

  const syncTableToUrl = useCallback(
    (tableId: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tableId != null) params.set("table", String(tableId));
      else params.delete("table");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleTableSelect = useCallback(
    (id: number | null) => {
      setSelectedTableId(id);
      syncTableToUrl(id);
    },
    [syncTableToUrl],
  );

  const handleRequestChangeTable = useCallback(() => {
    setSelectedTableId(null);
    syncTableToUrl(null);
  }, [syncTableToUrl]);

  useEffect(() => {
    if (initialTableId == null) return;
    const t = initialTables.find((x) => x.id === initialTableId);
    if (t && t.status === "available") {
      setSelectedTableId(initialTableId);
    }
  }, [initialTableId, initialTables]);

  const selectedTable = useMemo(
    () =>
      selectedTableId != null
        ? (localTables.find((table) => table.id === selectedTableId) ?? null)
        : null,
    [localTables, selectedTableId],
  );
  const selectedTableAvailable = selectedTable?.status === "available";
  const orderContextReady =
    orderType === "takeaway" || selectedTableAvailable;

  useEffect(() => {
    if (
      orderType === "dine_in" &&
      selectedTableId !== null &&
      selectedTable != null &&
      selectedTable.status !== "available"
    ) {
      setSelectedTableId(null);
      syncTableToUrl(null);
    }
  }, [orderType, selectedTable, selectedTableId, syncTableToUrl]);

  const loadSessionOrders = useCallback(async () => {
    const result = await fetchSessionOrders(branchId, session.id);
    if (result.success && result.data) {
      setSessionOrders(result.data as SessionOrder[]);
    }
  }, [branchId, session.id]);

  const refreshOperationalData = useCallback(async () => {
    const [ordersResult, tablesResult] = await Promise.all([
      fetchSessionOrders(branchId, session.id),
      fetchTablesForBranch(branchId),
    ]);
    let didRefresh = false;

    if (ordersResult.success && ordersResult.data) {
      setSessionOrders(ordersResult.data as SessionOrder[]);
      didRefresh = true;
    }

    if (tablesResult.success && tablesResult.data) {
      setLocalTables(tablesResult.data as BranchTable[]);
      didRefresh = true;
    }

    if (didRefresh) {
      setOperationalRefreshTick((tick) => tick + 1);
    }
  }, [branchId, session.id]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadSessionOrders();
  }, [loadSessionOrders]);

  const cartTotal = useMemo(() => calcCartTotal(cartItems), [cartItems]);

  const cartQuantity = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.quantity, 0),
    [cartItems],
  );

  const canSubmit =
    cartItems.length > 0 &&
    (orderType === "takeaway" || selectedTableAvailable);
  const selectedTableNumber = selectedTable?.number;
  const focusOrderWorkflow = useCallback((orderId: number) => {
    setShowOrders(true);
    setOrderDetailId(orderId);
    setCartDrawerOpen(false);
  }, []);

  const addToCart = useCallback(
    (
      item: import("./pos-menu-types").MenuItem,
      variantId?: number,
      variantName?: string,
      unitPrice?: number,
      modifiers: CartModifier[] = [],
      sides: CartSide[] = [],
    ) => {
      const price = unitPrice ?? item.base_price;
      const key = makeCartKey(item.id, variantId, modifiers, sides);
      setShowOrders(false);

      setCartItems((prev) => {
        const existing = prev.find((ci) => ci.key === key);
        if (existing) {
          return prev.map((ci) =>
            ci.key === key ? { ...ci, quantity: ci.quantity + 1 } : ci,
          );
        }
        const newItem: CartItem = {
          key,
          menu_item_id: item.id,
          item_name: item.name,
          variant_id: variantId,
          variant_name: variantName,
          quantity: 1,
          unit_price: price,
          modifiers,
          sides,
        };
        return [...prev, newItem];
      });
    },
    [],
  );

  const updateQuantity = useCallback((key: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((ci) =>
          ci.key === key ? { ...ci, quantity: ci.quantity + delta } : ci,
        )
        .filter((ci) => ci.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const handleOrderTypeChange = useCallback(
    (type: OrderType) => {
      setOrderType(type);
      if (type === "takeaway") {
        setSelectedTableId(null);
        syncTableToUrl(null);
      }
    },
    [syncTableToUrl],
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
            items: cartItems,
            order_type: orderType,
            table_id: selectedTableId ?? undefined,
            note: orderNote.trim() || undefined,
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

        setCartItems([]);
        setOrderNote("");
        focusOrderWorkflow(orderId);
        setSelectedTableId(null);
        syncTableToUrl(null);
        void refreshOperationalData();
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [
    canSubmit,
    branchId,
    cartItems,
    orderType,
    selectedTableId,
    session.id,
    syncTableToUrl,
    orderNote,
    focusOrderWorkflow,
    refreshOperationalData,
  ]);

  const handleItemTap = useCallback(
    (item: import("./pos-menu-types").MenuItem) => {
      const hasVariants = item.menu_item_variants.length > 0;
      const hasModifiers = item.menu_item_modifiers.length > 0;
      const hasSides = item.menu_item_available_sides.length > 0;

      if (appendTarget) {
        if (hasVariants || hasModifiers || hasSides) {
          setCustomizerItem(item);
        } else {
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
            const r = await appendOrderItems(branchId, appendTarget.orderId, [
              line,
            ]);
            if (r.success) {
              toast.success(`Đã thêm món vào đơn #${appendTarget.orderNumber}`);
              setAppendTarget(null);
              focusOrderWorkflow(appendTarget.orderId);
              void refreshOperationalData();
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
        addToCart(item);
      }
    },
    [addToCart, appendTarget, branchId, focusOrderWorkflow, refreshOperationalData],
  );

  const handleCustomizerConfirm = useCallback(
    (
      item: import("./pos-menu-types").MenuItem,
      variantId: number | undefined,
      variantName: string | undefined,
      unitPrice: number,
      modifiers: CartModifier[],
      sides: CartSide[],
    ) => {
      if (appendTarget) {
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
          const r = await appendOrderItems(branchId, appendTarget.orderId, [
            line,
          ]);
          if (r.success) {
            toast.success(`Đã thêm món vào đơn #${appendTarget.orderNumber}`);
            setAppendTarget(null);
            setCustomizerItem(null);
            focusOrderWorkflow(appendTarget.orderId);
            void refreshOperationalData();
          } else {
            toast.error(r.error ?? "Không thể thêm món");
          }
        });
        return;
      }
      addToCart(item, variantId, variantName, unitPrice, modifiers, sides);
      setCustomizerItem(null);
    },
    [addToCart, appendTarget, branchId, focusOrderWorkflow, refreshOperationalData],
  );

  const activeSessionOrders = useMemo(
    () =>
      sessionOrders.filter((order) =>
        ["new", "confirmed", "preparing", "ready", "served"].includes(
          order.status,
        ),
      ),
    [sessionOrders],
  );

  const hasAwaitingPaymentOrder = useMemo(
    () =>
      sessionOrders.some(
        (order) => order.status === "served" && order.payment_status !== "paid",
      ),
    [sessionOrders],
  );

  useEffect(() => {
    if (!hasAwaitingPaymentOrder || billOrderId !== null) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshOperationalData();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [billOrderId, hasAwaitingPaymentOrder, refreshOperationalData]);

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
          value={orderType}
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
          >
            <UtensilsCrossed className="size-4" />
            Tại bàn
          </ToggleGroupItem>
          <ToggleGroupItem
            value="takeaway"
            className="min-h-11 justify-center gap-2 rounded-lg text-sm font-semibold"
          >
            <Package className="size-4" />
            Mang về
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );

  const appendBannerRow =
    appendTarget != null ? (
      <div className="border-b border-warning/15 bg-warning/10 px-3 py-3 md:px-4" role="status">
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="rounded-xl border border-warning/20 bg-warning/10 shadow-sm p-3">
            <div className="relative flex items-center justify-between gap-2">
              <p className="min-w-0 text-sm leading-6 text-foreground">
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
                className="min-h-11 min-w-11 h-9 shrink-0 gap-1 rounded-full px-3 text-xs text-foreground hover:bg-warning/25"
                onClick={() => setAppendTarget(null)}
              >
                <X className="size-3.5" />
                Hủy
              </Button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const sidebarSharedProps = {
    showOrders,
    onShowOrdersChange: setShowOrders,
    cartItems,
    cartTotal,
    cartQuantity,
    orderType,
    selectedTableId,
    tables: localTables,
    canSubmit,
    isPending,
    sessionOrders,
    orderNote,
    onUpdateQuantity: updateQuantity,
    onRemoveItem: removeItem,
    onClearCart: clearCart,
    onOrderTypeChange: handleOrderTypeChange,
    onRequestChangeTable: handleRequestChangeTable,
    onSubmitOrder: handleSubmitOrder,
    onOrderNoteChange: setOrderNote,
    onViewBill: (id: number) => {
      setCartDrawerOpen(false);
      setBillOrderId(id);
    },
    onViewDetail: (id: number) => {
      setCartDrawerOpen(false);
      setOrderDetailId(id);
    },
    onLoadSessionOrders: () => void loadSessionOrders(),
  } as const;
  const mobileActionBar =
    isMobile && (orderContextReady || activeSessionOrders.length > 0) ? (
      <div className="fixed bottom-4 left-4 right-4 z-40 flex gap-2 md:hidden">
        {activeSessionOrders.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            className="min-h-14 min-w-14 flex-1 rounded-full text-sm font-bold shadow-lg"
            onClick={() => {
              setShowOrders(true);
              void loadSessionOrders();
              setCartDrawerOpen(true);
            }}
          >
            Đơn đang phục vụ
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
            <ShoppingCart className="size-5" />
            {cartQuantity > 0 ? (
              <>
                <span className="tabular-nums">{cartQuantity}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {formatVND(cartTotal)}
                </span>
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
      <DrawerContent className="max-h-dvh p-0">
        <DrawerTitle className="sr-only">
          {showOrders ? "Đơn đang phục vụ" : "Giỏ hàng"}
        </DrawerTitle>
        <div className="flex min-h-0 flex-col overflow-hidden">
          <PosSidebarTabs {...sidebarSharedProps} />
          <PosSidebarContent
            {...sidebarSharedProps}
            onSubmitOrder={() => {
              handleSubmitOrder();
              // Drawer stays open on submit so validation errors remain visible.
            }}
          />
        </div>
      </DrawerContent>
    </Drawer>
  ) : null;

  return (
    <>
      <PosSessionHeader
        session={session}
        orderType={orderType}
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
              tables={localTables}
              selectedTableId={selectedTableId}
              onTableSelect={handleTableSelect}
              className="min-h-0 flex-1"
            />
          </div>
          <div className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background md:flex lg:w-96">
            <PosSidebarTabs {...sidebarSharedProps} />
            <PosSidebarContent {...sidebarSharedProps} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {appendBannerRow}

              <PosMenuGrid
                categories={categories}
                cartQuantity={cartQuantity}
                cartTotal={cartTotal}
                orderType={orderType}
                selectedTableNumber={selectedTableNumber}
                onItemTap={handleItemTap}
              />
            </div>

            <div className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background md:flex lg:w-96">
              <PosSidebarTabs {...sidebarSharedProps} />
              <PosSidebarContent {...sidebarSharedProps} />
            </div>

          </div>
        </>
      )}

      {mobileActionBar}
      {mobileSidebarDrawer}

      <ItemCustomizer
        item={customizerItem}
        onClose={() => setCustomizerItem(null)}
        onConfirm={handleCustomizerConfirm}
        mode={appendTarget ? "append" : "new"}
        appendOrderLabel={appendTarget?.orderNumber ?? null}
      />

      <OrderDetailSheet
        orderId={orderDetailId}
        refreshToken={operationalRefreshTick}
        onClose={() => setOrderDetailId(null)}
        onOpenBill={(id) => {
          setOrderDetailId(null);
          setCartDrawerOpen(false);
          setBillOrderId(id);
        }}
        onStartAppend={(oid, onum) => {
          setOrderDetailId(null);
          setCartDrawerOpen(false);
          setAppendTarget({ orderId: oid, orderNumber: onum });
          setShowOrders(false);
          toast.message("Chọn món trên menu để thêm vào đơn");
        }}
        onReorderToCart={(items, skippedCount) => {
          setCartItems(items);
          setShowOrders(false);
          if (skippedCount > 0) {
            toast.message(
              `Đã bỏ qua ${String(skippedCount)} món không còn trong thực đơn.`,
            );
          } else {
            toast.success("Đã thêm món vào giỏ từ đơn cũ");
          }
        }}
        tables={localTables}
        onOrderUpdated={() => void refreshOperationalData()}
      />

      <CloseSessionDialog
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      <BillReceipt
        branchId={branchId}
        orderId={billOrderId}
        onOrderUpdated={() => void refreshOperationalData()}
        onClose={() => setBillOrderId(null)}
      />
    </>
  );
}
