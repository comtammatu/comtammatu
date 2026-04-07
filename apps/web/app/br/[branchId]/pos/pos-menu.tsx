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
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { toast } from "@comtammatu/ui/components/sonner";
import { Clock, DoorOpen, LogOut, Monitor } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { CATEGORY_TYPE_LABELS } from "@comtammatu/shared/menu";
import { CartSidebar } from "./cart-sidebar";
import { ItemCustomizer } from "./item-customizer";
import { CloseSessionDialog } from "./close-session-dialog";
import { BillReceipt } from "./bill-receipt";
import { OrderHistory } from "./order-history";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { submitOrder, fetchSessionOrders } from "./actions";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import { calcCartTotal } from "./types";
import type { BranchTable, ActiveSession } from "./page";
import type { SessionOrder } from "./order-history";

/* ─── Menu data types (derived from fetchMenuForPos action) ─── */

export interface MenuVariant {
  id: number;
  name: string;
  price_adjustment: number;
  sort_order: number;
}

export interface MenuModifier {
  id: number;
  name: string;
  price: number;
  sort_order: number;
}

export interface MenuAvailableSide {
  id: number;
  is_default: boolean;
  side_item: { id: number; name: string; base_price: number };
}

export interface MenuItem {
  id: number;
  name: string;
  base_price: number;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  menu_item_variants: MenuVariant[];
  menu_item_modifiers: MenuModifier[];
  menu_item_available_sides: MenuAvailableSide[];
}

export interface MenuCategory {
  id: number;
  name: string;
  type: string;
  sort_order: number;
  menu_items: MenuItem[];
}

/* ─── Helpers ─── */

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  categories: MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
  /** From URL `?table=` — preselect dine-in table when valid */
  initialTableId?: number;
}

export function PosMenu({
  branchId,
  categories,
  tables: initialTables,
  session,
  initialTableId,
}: PosMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    categories[0]?.id ?? null,
  );
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [localTables, setLocalTables] = useState<BranchTable[]>(initialTables);
  const [sessionOrders, setSessionOrders] = useState<SessionOrder[]>([]);
  const [showOrders, setShowOrders] = useState(false);

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

  useEffect(() => {
    if (initialTableId == null) return;
    const t = initialTables.find((x) => x.id === initialTableId);
    if (t && t.status !== "maintenance") {
      setSelectedTableId(initialTableId);
    }
  }, [initialTableId, initialTables]);

  // Preserve activeCategoryId across RSC re-renders that pass new categories
  const activeCategoryIdRef = useRef(activeCategoryId);
  activeCategoryIdRef.current = activeCategoryId;
  useEffect(() => {
    const stillExists = categories.some(
      (c) => c.id === activeCategoryIdRef.current,
    );
    if (!stillExists) {
      setActiveCategoryId(categories[0]?.id ?? null);
    }
  }, [categories]);

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

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId),
    [categories, activeCategoryId],
  );

  const cartTotal = useMemo(() => calcCartTotal(cartItems), [cartItems]);

  const canSubmit =
    cartItems.length > 0 &&
    (orderType === "takeaway" || selectedTableId !== null);

  const addToCart = useCallback(
    (
      item: MenuItem,
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
  ]);

  const handleItemTap = useCallback(
    (item: MenuItem) => {
      const hasVariants = item.menu_item_variants.length > 0;
      const hasModifiers = item.menu_item_modifiers.length > 0;
      const hasSides = item.menu_item_available_sides.length > 0;

      if (hasVariants || hasModifiers || hasSides) {
        setCustomizerItem(item);
      } else {
        addToCart(item);
      }
    },
    [addToCart],
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
      addToCart(item, variantId, variantName, unitPrice, modifiers, sides);
      setCustomizerItem(null);
    },
    [addToCart],
  );

  return (
    <>
      {/* Left Panel — Menu Browse */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Session header — back + meta + đóng ca (no extra full-width row) */}
        <div className="flex items-center justify-between gap-2 border-b bg-background px-2 py-2 sm:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <EmployeePortalBackControl />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Monitor className="size-3 shrink-0" />
                <span className="truncate">
                  {session.pos_terminals?.name ?? "POS"}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <Clock className="size-3 shrink-0" />
                <span className="truncate">
                  <span className="hidden sm:inline">Ca mở lúc </span>
                  {formatTime(session.opened_at)}
                </span>
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={() => setShowCloseSession(true)}
          >
            <LogOut className="mr-1 size-3" />
            Đóng ca
          </Button>
        </div>

        {/* Category tabs */}
        <div className="border-b bg-muted/30">
          <ScrollArea className="w-full">
            <div className="flex gap-1 p-2">
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={activeCategoryId === cat.id ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "shrink-0 text-sm",
                    activeCategoryId === cat.id && "shadow-sm",
                  )}
                  onClick={() => setActiveCategoryId(cat.id)}
                >
                  {cat.name}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "ml-1.5 text-[10px]",
                      activeCategoryId === cat.id &&
                        "bg-primary-foreground/20 text-primary-foreground",
                    )}
                  >
                    {cat.menu_items.length}
                  </Badge>
                </Button>
              ))}
            </div>
          </ScrollArea>
          {activeCategory && (
            <div className="px-3 pb-2">
              <span className="text-xs text-muted-foreground">
                {CATEGORY_TYPE_LABELS[activeCategory.type] ??
                  activeCategory.type}
              </span>
            </div>
          )}
        </div>

        {/* Item grid */}
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-4">
            {activeCategory?.menu_items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex flex-col rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent active:scale-[0.98]"
                onClick={() => handleItemTap(item)}
              >
                <span className="line-clamp-2 text-sm font-medium">
                  {item.name}
                </span>
                {item.menu_item_variants.length > 0 && (
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {item.menu_item_variants.length} lựa chọn
                  </span>
                )}
                <span className="mt-auto pt-2 text-sm font-semibold text-primary">
                  {formatVND(item.base_price)}
                </span>
              </button>
            ))}
          </div>
          {activeCategory?.menu_items.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Không có món trong danh mục này
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Panel — Cart / Orders */}
      <div className="flex w-[320px] shrink-0 flex-col border-l bg-background lg:w-[360px]">
        <div className="border-b px-2 py-2">
          <div
            role="tablist"
            aria-label="POS sidebar"
            className="flex gap-1 rounded-lg bg-muted p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!showOrders}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                !showOrders
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setShowOrders(false)}
            >
              Giỏ hàng
              {cartItems.length > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {cartItems.reduce((sum, i) => sum + i.quantity, 0)}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showOrders}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                showOrders
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setShowOrders(true);
                void loadSessionOrders();
              }}
            >
              Đơn hàng
            </button>
          </div>
        </div>

        {showOrders ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Đơn hàng</span>
                {sessionOrders.length > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {sessionOrders.length}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void loadSessionOrders()}
              >
                <DoorOpen className="mr-1 size-3" />
                Tải lại
              </Button>
            </div>
            <OrderHistory
              orders={sessionOrders}
              onViewBill={(orderId) => setBillOrderId(orderId)}
            />
          </div>
        ) : (
          <CartSidebar
            items={cartItems}
            total={cartTotal}
            orderType={orderType}
            selectedTableId={selectedTableId}
            tables={localTables}
            canSubmit={canSubmit}
            isSubmitting={isPending}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onClearCart={clearCart}
            onOrderTypeChange={handleOrderTypeChange}
            onTableSelect={handleTableSelect}
            onSubmitOrder={handleSubmitOrder}
          />
        )}
      </div>

      {/* Item Customizer Sheet */}
      <ItemCustomizer
        item={customizerItem}
        onClose={() => setCustomizerItem(null)}
        onConfirm={handleCustomizerConfirm}
      />

      {/* Close Session Dialog */}
      <CloseSessionDialog
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      {/* Bill Receipt Sheet */}
      <BillReceipt orderId={billOrderId} onClose={() => setBillOrderId(null)} />
    </>
  );
}
