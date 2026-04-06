"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  const sideKeys = sides
    .map((s) => `${String(s.side_item_id)}:${String(s.quantity)}`)
    .sort()
    .join(",");
  return `${String(itemId)}-${String(variantId ?? 0)}-${modIds}-${sideKeys}`;
}

/* ─── Component ─── */

interface PosMenuProps {
  branchId: number;
  categories: MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
}

export function PosMenu({
  branchId,
  categories,
  tables: initialTables,
  session,
}: PosMenuProps) {
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

  // Keep localTables in sync when server re-fetches (e.g. page navigation)
  useEffect(() => {
    setLocalTables(initialTables);
  }, [initialTables]);

  // Preserve activeCategoryId across RSC re-renders that pass new categories
  // If current activeCategoryId no longer exists in categories, reset to first
  const activeCategoryIdRef = useRef(activeCategoryId);
  activeCategoryIdRef.current = activeCategoryId;
  useEffect(() => {
    const stillExists = categories.some((c) => c.id === activeCategoryIdRef.current);
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

  // Load session orders on mount
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

  const handleOrderTypeChange = useCallback((type: OrderType) => {
    setOrderType(type);
    if (type === "takeaway") {
      setSelectedTableId(null);
    }
  }, []);

  const handleSubmitOrder = useCallback(() => {
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await submitOrder(
        branchId,
        {
          items: cartItems,
          order_type: orderType,
          table_id: selectedTableId ?? undefined,
        },
        session.id,
      );

      if (result.success && result.data) {
        toast.success(`Đặt món thành công — #${result.data.order_number}`, {
          action: {
            label: "Xem hóa đơn",
            onClick: () => setBillOrderId(result.data!.order_id),
          },
        });

        // Mark table as occupied locally for dine_in orders
        if (orderType === "dine_in" && selectedTableId !== null) {
          const occupiedTableId = selectedTableId;
          setLocalTables((prev) =>
            prev.map((t) =>
              t.id === occupiedTableId ? { ...t, status: "occupied" } : t,
            ),
          );
        }

        setCartItems([]);
        setSelectedTableId(null);

        // Refresh order history
        void loadSessionOrders();
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [canSubmit, branchId, cartItems, orderType, selectedTableId, session.id, loadSessionOrders]);

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
        {/* Session header */}
        <div className="flex items-center justify-between border-b bg-background px-3 py-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Monitor className="size-3" />
              {session.pos_terminals?.name ?? "POS"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              Ca mở lúc {formatTime(session.opened_at)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowCloseSession(true)}
            >
              <LogOut className="mr-1 size-3" />
              Đóng ca
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              asChild
            >
              <a href="/employee">
                <DoorOpen className="mr-1 size-3" />
                Đăng xuất
              </a>
            </Button>
          </div>
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

      {/* Right Panel — Cart + Orders */}
      <div className="flex w-[320px] shrink-0 flex-col border-l bg-background lg:w-[360px]">
        {/* Tab toggle: Cart / Orders */}
        <div className="flex border-b">
          <button
            type="button"
            className={cn(
              "flex-1 px-3 py-2 text-sm font-medium transition-colors",
              !showOrders
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setShowOrders(false)}
          >
            Giỏ hàng
            {cartItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {cartItems.reduce((sum, i) => sum + i.quantity, 0)}
              </span>
            )}
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 px-3 py-2 text-sm font-medium transition-colors",
              showOrders
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setShowOrders(true)}
          >
            Đơn hàng
            {sessionOrders.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                {sessionOrders.length}
              </span>
            )}
          </button>
        </div>

        {showOrders ? (
          <OrderHistory
            orders={sessionOrders}
            onViewBill={(orderId) => {
              setBillOrderId(orderId);
              setShowOrders(false);
            }}
          />
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
            onTableSelect={setSelectedTableId}
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
      <BillReceipt
        orderId={billOrderId}
        onClose={() => setBillOrderId(null)}
      />
    </>
  );
}
