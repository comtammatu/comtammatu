"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { toast } from "@comtammatu/ui/components/sonner";
import { CartSidebar } from "./cart-sidebar";
import { ItemCustomizer } from "./item-customizer";
import { submitOrder } from "./actions";
import type { CartItem, CartModifier, CartSide, OrderType } from "./types";
import { calcCartTotal } from "./types";
import type { BranchTable } from "./page";

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

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function makeCartKey(
  itemId: number,
  variantId: number | undefined,
  modifiers: CartModifier[],
): string {
  const modIds = modifiers
    .map((m) => m.modifier_id)
    .sort((a, b) => a - b)
    .join(",");
  return `${String(itemId)}-${String(variantId ?? 0)}-${modIds}`;
}

/* ─── Category type labels ─── */

const CATEGORY_TYPE_LABELS: Record<string, string> = {
  main_dish: "Món chính",
  side_dish: "Món phụ",
  drink: "Nước uống",
  dessert: "Tráng miệng",
};

/* ─── Component ─── */

interface PosMenuProps {
  branchId: number;
  categories: MenuCategory[];
  tables: BranchTable[];
}

export function PosMenu({ branchId, categories, tables }: PosMenuProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    categories[0]?.id ?? null,
  );
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

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
      const key = makeCartKey(item.id, variantId, modifiers);

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
      const result = await submitOrder(branchId, {
        items: cartItems,
        order_type: orderType,
        table_id: selectedTableId ?? undefined,
      });

      if (result.success && result.data) {
        toast.success(`Đặt món thành công — #${result.data.order_number}`);
        setCartItems([]);
        setSelectedTableId(null);
      } else {
        toast.error(result.error ?? "Không thể tạo đơn hàng");
      }
    });
  }, [canSubmit, branchId, cartItems, orderType, selectedTableId]);

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
                  {formatVnd(item.base_price)}
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

      {/* Right Panel — Cart */}
      <CartSidebar
        items={cartItems}
        total={cartTotal}
        orderType={orderType}
        selectedTableId={selectedTableId}
        tables={tables}
        canSubmit={canSubmit}
        isSubmitting={isPending}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onClearCart={clearCart}
        onOrderTypeChange={handleOrderTypeChange}
        onTableSelect={setSelectedTableId}
        onSubmitOrder={handleSubmitOrder}
        formatVnd={formatVnd}
      />

      {/* Item Customizer Sheet */}
      <ItemCustomizer
        item={customizerItem}
        onClose={() => setCustomizerItem(null)}
        onConfirm={handleCustomizerConfirm}
        formatVnd={formatVnd}
      />
    </>
  );
}
