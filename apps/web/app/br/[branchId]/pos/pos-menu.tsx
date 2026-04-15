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
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
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
import { submitOrder, fetchSessionOrders, appendOrderItems } from "./actions";
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
    if (t && t.status !== "maintenance") {
      setSelectedTableId(initialTableId);
    }
  }, [initialTableId, initialTables]);

  const orderContextReady =
    orderType === "takeaway" || selectedTableId !== null;

  const loadSessionOrders = useCallback(async () => {
    const result = await fetchSessionOrders(branchId, session.id);
    if (result.success && result.data) {
      setSessionOrders(result.data as SessionOrder[]);
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
    (orderType === "takeaway" || selectedTableId !== null);
  const selectedTableNumber =
    selectedTableId != null
      ? localTables.find((table) => table.id === selectedTableId)?.number
      : undefined;
  const orderContextComplete =
    orderType === "takeaway" || selectedTableId !== null;

  const flowSteps = useMemo<
    ReadonlyArray<{
      label: string;
      meta: string;
      state: "done" | "current" | "todo";
    }>
  >(
    () => [
      {
        label: "Loại đơn",
        meta: orderType === "takeaway" ? "Mang về" : "Tại bàn",
        state: "done",
      },
      {
        label: "Ngữ cảnh bàn",
        meta:
          orderType === "takeaway"
            ? "Đơn mang về"
            : selectedTableNumber != null
              ? `Bàn ${selectedTableNumber}`
              : "Chọn bàn",
        state: orderContextComplete ? "done" : "current",
      },
      {
        label: "Chọn món",
        meta:
          cartItems.length > 0
            ? `${cartQuantity} món trong giỏ`
            : "Thêm món",
        state:
          cartItems.length > 0
            ? "done"
            : orderContextComplete
              ? "current"
              : "todo",
      },
      {
        label: "Gửi xuống bếp",
        meta: canSubmit ? "Sẵn sàng" : "Chưa sẵn sàng",
        state: canSubmit ? "current" : "todo",
      },
    ],
    [
      cartItems.length,
      cartQuantity,
      canSubmit,
      orderContextComplete,
      orderType,
      selectedTableNumber,
    ],
  );

  const flowProgressPercent = useMemo(() => {
    let progress = 22;
    if (orderContextComplete) progress += 24;
    if (cartItems.length > 0) progress += 28;
    if (canSubmit) progress += 26;
    return progress;
  }, [canSubmit, cartItems.length, orderContextComplete]);

  const flowHeadline = canSubmit
    ? "Có thể gửi bếp."
    : orderContextComplete
      ? "Thêm món để hoàn tất."
      : "Chọn ngữ cảnh trước.";

  const flowHint = canSubmit
      ? "Kiểm tra giỏ và gửi bếp."
      : orderContextComplete
      ? "Thêm món vào giỏ."
      : "Gán bàn cho đơn tại chỗ.";

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

        if (orderType === "dine_in" && selectedTableId !== null) {
          const occupiedTableId = selectedTableId;
          setLocalTables((prev) =>
            prev.map((t) =>
              t.id === occupiedTableId ? { ...t, status: "occupied" } : t,
            ),
          );
        }

        setCartItems([]);
        setOrderNote("");
        if (orderType === "takeaway") {
          setSelectedTableId(null);
          syncTableToUrl(null);
        }
        void loadSessionOrders();
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [
    canSubmit,
    branchId,
    cartItems,
    loadSessionOrders,
    orderType,
    selectedTableId,
    session.id,
    syncTableToUrl,
    orderNote,
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
              void loadSessionOrders();
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
    [addToCart, appendTarget, branchId, loadSessionOrders],
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
            void loadSessionOrders();
          } else {
            toast.error(r.error ?? "Không thể thêm món");
          }
        });
        return;
      }
      addToCart(item, variantId, variantName, unitPrice, modifiers, sides);
      setCustomizerItem(null);
    },
    [addToCart, appendTarget, branchId, loadSessionOrders],
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
  const completedSessionOrders = useMemo(
    () =>
      sessionOrders.filter(
        (order) => !activeSessionOrders.some((active) => active.id === order.id),
      ),
    [activeSessionOrders, sessionOrders],
  );
  const readySessionOrders = useMemo(
    () => sessionOrders.filter((order) => order.status === "ready"),
    [sessionOrders],
  );
  const sessionRevenue = useMemo(
    () =>
      sessionOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
    [sessionOrders],
  );

  const serviceModeSelector = (
    <div className="rounded-xl border bg-card shadow-sm p-3">
          <div className="relative space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Loại đơn
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Đổi nhanh giữa tại bàn và mang về trong cùng ca POS.
              </p>
            </div>
        <div
          role="radiogroup"
          aria-label="Loại đơn hàng"
          className="grid grid-cols-2 gap-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={orderType === "dine_in"}
            className={cn(
              "min-h-11 min-w-11 flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              orderType === "dine_in"
                ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
                : "border-border/70 bg-background text-foreground hover:border-primary/20",
            )}
            onClick={() => handleOrderTypeChange("dine_in")}
          >
            <UtensilsCrossed className="size-4" />
            Tại bàn
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={orderType === "takeaway"}
            className={cn(
              "min-h-11 min-w-11 flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              orderType === "takeaway"
                ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
                : "border-border/70 bg-background text-foreground hover:border-primary/20",
            )}
            onClick={() => handleOrderTypeChange("takeaway")}
          >
            <Package className="size-4" />
            Mang về
          </button>
        </div>
      </div>
    </div>
  );

  const workflowRail = (
    <aside className="hidden xl:flex xl:w-80 xl:shrink-0 xl:flex-col xl:gap-4 xl:border-r xl:border-border/60 xl:bg-background/70 xl:p-4">
      {serviceModeSelector}
      <div className="rounded-xl border bg-card shadow-sm p-4">
          <div className="relative space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Điều phối đơn
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {orderType === "takeaway"
                ? "Đơn mang về"
                : selectedTableNumber != null
                  ? `Bàn ${selectedTableNumber}`
                  : "Cần gán bàn"}
            </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {orderType === "takeaway"
                ? "Không cần gán bàn, có thể thêm món và tạo đơn ngay."
                : selectedTableNumber != null
                  ? "Ngữ cảnh bàn đã sẵn sàng cho tạo đơn mới hoặc thêm món."
                  : "Chọn đúng bàn để tránh sai luồng phục vụ."}
              </p>
            </div>

          <div className="space-y-2">
            {flowSteps.map((step, index) => (
              <div
                key={step.label}
                className="transition-all hover:-translate-y-0.5 hover:shadow-md rounded-xl border border-border bg-card px-3 py-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">{index + 1}</div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {step.label}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {step.meta}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="transition-all hover:-translate-y-0.5 hover:shadow-md rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Đơn đang chạy
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {activeSessionOrders.length}
          </p>
        </div>
        <div className="transition-all hover:-translate-y-0.5 hover:shadow-md rounded-xl border border-success/15 bg-success/10 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">
            Sẵn sàng giao
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {readySessionOrders.length}
          </p>
        </div>
      </div>
    </aside>
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
                  Chọn món trên lưới bên dưới để tiếp tục cùng một flow.
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
    flowProgressPercent,
    flowHeadline,
    flowHint,
    flowSteps,
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
    onViewBill: (id: number) => setBillOrderId(id),
    onViewDetail: (id: number) => setOrderDetailId(id),
    onLoadSessionOrders: () => void loadSessionOrders(),
  } as const;

  return (
    <>
      <PosSessionHeader
        session={session}
        orderType={orderType}
        selectedTableNumber={selectedTableNumber}
        flowHeadline={flowHeadline}
        flowHint={flowHint}
        flowSteps={flowSteps}
        flowProgressPercent={flowProgressPercent}
        isPending={isPending}
        canSubmit={canSubmit}
        cartQuantity={cartQuantity}
        cartTotal={cartTotal}
        activeOrderCount={activeSessionOrders.length}
        readyOrderCount={readySessionOrders.length}
        completedOrderCount={completedSessionOrders.length}
        sessionRevenue={sessionRevenue}
        onShowCloseSession={() => setShowCloseSession(true)}
      />

      {!orderContextReady ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
          {workflowRail}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appendBannerRow}
            <div className="border-b border-border/60 bg-background/75 p-3 xl:hidden">
              {serviceModeSelector}
            </div>
            <PosTableGate
              tables={localTables}
              selectedTableId={selectedTableId}
              onTableSelect={handleTableSelect}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 overflow-hidden bg-background/35">
            {workflowRail}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {appendBannerRow}

              <div className="border-b border-border/60 bg-background/80 p-3 xl:hidden">
                {serviceModeSelector}
              </div>

              <PosMenuGrid
                categories={categories}
                cartQuantity={cartQuantity}
                cartTotal={cartTotal}
                onItemTap={handleItemTap}
              />
            </div>

            <div className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background md:flex lg:w-96">
              <PosSidebarTabs {...sidebarSharedProps} />
              <PosSidebarContent {...sidebarSharedProps} />
            </div>

            {isMobile && (
              <button
                type="button"
                className="min-h-14 min-w-14 fixed bottom-6 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
                onClick={() => setCartDrawerOpen(true)}
                aria-label="Mở giỏ hàng"
              >
                <ShoppingCart className="size-5" />
                {cartQuantity > 0 ? (
                  <>
                    <span className="tabular-nums">{cartQuantity}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{formatVND(cartTotal)}</span>
                  </>
                ) : (
                  <span>Mở điều phối</span>
                )}
              </button>
            )}

            {isMobile && (
              <Drawer
                open={cartDrawerOpen}
                onOpenChange={setCartDrawerOpen}
                shouldScaleBackground={false}
              >
                <DrawerContent className="p-0" style={{ maxHeight: "85dvh" }}>
                  <DrawerTitle className="sr-only">Giỏ hàng</DrawerTitle>
                  <div className="flex flex-col overflow-hidden" style={{ maxHeight: "calc(85dvh - 2rem)" }}>
                    <PosSidebarTabs {...sidebarSharedProps} />
                    <PosSidebarContent
                      {...sidebarSharedProps}
                      onSubmitOrder={() => {
                        handleSubmitOrder();
                        setCartDrawerOpen(false);
                      }}
                    />
                  </div>
                </DrawerContent>
              </Drawer>
            )}
          </div>
        </>
      )}

      <ItemCustomizer
        item={customizerItem}
        onClose={() => setCustomizerItem(null)}
        onConfirm={handleCustomizerConfirm}
        mode={appendTarget ? "append" : "new"}
        appendOrderLabel={appendTarget?.orderNumber ?? null}
      />

      <OrderDetailSheet
        orderId={orderDetailId}
        onClose={() => setOrderDetailId(null)}
        onOpenBill={(id) => {
          setOrderDetailId(null);
          setBillOrderId(id);
        }}
        onStartAppend={(oid, onum) => {
          setOrderDetailId(null);
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
        onTablesChange={setLocalTables}
      />

      <CloseSessionDialog
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      <BillReceipt
        branchId={branchId}
        orderId={billOrderId}
        onClose={() => setBillOrderId(null)}
      />
    </>
  );
}
