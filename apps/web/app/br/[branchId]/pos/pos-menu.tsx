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
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  Clock,
  DoorOpen,
  LogOut,
  Monitor,
  Package,
  ShoppingCart,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { CategoryType } from "@comtammatu/shared";
import { CATEGORY_TYPE_LABELS } from "@comtammatu/shared/menu";
import { PosTableGate } from "./pos-table-gate";
import { CartSidebar } from "./cart-sidebar";
import { ItemCustomizer } from "./item-customizer";
import { CloseSessionDialog } from "./close-session-dialog";
import { BillReceipt } from "./bill-receipt";
import { OrderHistory } from "./order-history";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { submitOrder, fetchSessionOrders, appendOrderItems } from "./actions";
import { OrderDetailSheet } from "./order-detail-sheet";
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

const MENU_ZONE_ORDER: CategoryType[] = [
  "main_dish",
  "side_dish",
  "drink",
  "dessert",
];

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
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    categories[0]?.id ?? null,
  );
  const [activeMenuZone, setActiveMenuZone] = useState<CategoryType | null>(
    null,
  );
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
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

  const availableMenuZones = useMemo(
    () =>
      MENU_ZONE_ORDER.filter((z) =>
        categories.some((c) => c.type === z && c.menu_items.length > 0),
      ),
    [categories],
  );

  const effectiveMenuZone = useMemo(() => {
    if (activeMenuZone != null && availableMenuZones.includes(activeMenuZone)) {
      return activeMenuZone;
    }
    return availableMenuZones[0] ?? "main_dish";
  }, [activeMenuZone, availableMenuZones]);

  const categoriesInActiveZone = useMemo(
    () => categories.filter((c) => c.type === effectiveMenuZone),
    [categories, effectiveMenuZone],
  );

  useEffect(() => {
    setActiveCategoryId((prev) => {
      const ok = categoriesInActiveZone.some((c) => c.id === prev);
      return ok ? prev : (categoriesInActiveZone[0]?.id ?? null);
    });
  }, [categoriesInActiveZone]);

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

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId),
    [categories, activeCategoryId],
  );

  const cartTotal = useMemo(() => calcCartTotal(cartItems), [cartItems]);

  const cartQuantity = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.quantity, 0),
    [cartItems],
  );

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
    (item: MenuItem) => {
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
      item: MenuItem,
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

  const sessionHeader = (
    <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <EmployeePortalBackControl />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Monitor className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {session.pos_terminals?.name ?? "POS"}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" />
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
        className="touch-target h-9 shrink-0 gap-1.5 px-3 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => setShowCloseSession(true)}
      >
        <LogOut className="size-3.5" />
        Đóng ca
      </Button>
    </div>
  );

  const appendBannerRow =
    appendTarget != null ? (
      <div
        className="flex items-center justify-between gap-2 border-b bg-warning/15 px-3 py-2"
        role="status"
      >
        <p className="min-w-0 text-xs leading-snug text-foreground">
          <span className="font-semibold">
            Thêm món vào đơn #{appendTarget.orderNumber}
          </span>
          <span className="text-muted-foreground">
            {" "}
            — chọn món trên lưới bên dưới
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="touch-target h-8 shrink-0 gap-1 px-2 text-xs text-foreground hover:bg-warning/25"
          onClick={() => setAppendTarget(null)}
        >
          <X className="size-3.5" />
          Hủy
        </Button>
      </div>
    ) : null;

  const orderTypeRow = (
    <div className="border-b bg-background px-3 py-2">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Loại đơn
      </p>
      <div
        role="radiogroup"
        aria-label="Loại đơn hàng"
        className="flex gap-1 rounded-lg bg-muted p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={orderType === "dine_in"}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            orderType === "dine_in"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => handleOrderTypeChange("dine_in")}
        >
          <UtensilsCrossed className="size-3.5" />
          Tại bàn
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={orderType === "takeaway"}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            orderType === "takeaway"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => handleOrderTypeChange("takeaway")}
        >
          <Package className="size-3.5" />
          Mang về
        </button>
      </div>
    </div>
  );

  return (
    <>
      {!orderContextReady ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {sessionHeader}
          {appendBannerRow}
          {orderTypeRow}
          <PosTableGate
            tables={localTables}
            selectedTableId={selectedTableId}
            onTableSelect={handleTableSelect}
            className="min-h-0 flex-1"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col overflow-hidden">
            {sessionHeader}
            {appendBannerRow}

            {availableMenuZones.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <p className="text-sm font-medium">
                  Chưa có món trong thực đơn
                </p>
                <p className="text-xs">
                  Thêm danh mục và món trong quản trị để phục vụ tại POS.
                </p>
              </div>
            ) : (
              <>
                {/* Khu thực đơn (món chính / phụ / nước / tráng miệng) */}
                <div className="border-b bg-background">
                  <ScrollArea className="w-full">
                    <div
                      className="flex gap-1 px-2 py-1.5 md:px-3 md:py-2"
                      role="tablist"
                      aria-label="Khu thực đơn"
                    >
                      {availableMenuZones.map((z) => (
                        <button
                          key={z}
                          type="button"
                          role="tab"
                          aria-selected={effectiveMenuZone === z}
                          className={cn(
                            "touch-target flex h-11 shrink-0 cursor-pointer items-center rounded-md px-3 text-sm font-semibold transition-colors md:px-4",
                            effectiveMenuZone === z
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          onClick={() => setActiveMenuZone(z)}
                        >
                          {CATEGORY_TYPE_LABELS[z] ?? z}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Danh mục trong khu (nếu có nhiều danh mục) */}
                {categoriesInActiveZone.length > 1 ? (
                  <div className="border-b bg-muted/20">
                    <ScrollArea className="w-full">
                      <div
                        className="flex gap-1 px-3 py-1.5"
                        role="tablist"
                        aria-label="Danh mục món"
                      >
                        {categoriesInActiveZone.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            role="tab"
                            aria-selected={activeCategoryId === cat.id}
                            className={cn(
                              "touch-target flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                              activeCategoryId === cat.id
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            onClick={() => setActiveCategoryId(cat.id)}
                          >
                            {cat.name}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                activeCategoryId === cat.id &&
                                  "border-primary/30 bg-primary/10 text-primary",
                              )}
                            >
                              {cat.menu_items.length}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  activeCategory && (
                    <div className="border-b bg-muted/20 px-3 py-2">
                      <p className="text-sm font-semibold text-foreground">
                        {activeCategory.name}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_TYPE_LABELS[activeCategory.type] ??
                          activeCategory.type}
                      </span>
                    </div>
                  )
                )}

                {/* Lưới món */}
                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-2 gap-2 p-2.5 md:grid-cols-3 md:gap-2.5 md:p-3 lg:grid-cols-4">
                    {activeCategory?.menu_items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="touch-target-lg focus-ring-standard flex min-h-20 cursor-pointer flex-col rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.97] md:p-3.5"
                        onClick={() => handleItemTap(item)}
                      >
                        <span className="line-clamp-2 text-base font-semibold leading-snug">
                          {item.name}
                        </span>
                        {item.menu_item_variants.length > 0 && (
                          <span className="mt-1 text-xs text-muted-foreground">
                            {item.menu_item_variants.length} lựa chọn
                          </span>
                        )}
                        <span className="mt-auto pt-2.5 text-base font-bold text-primary">
                          {formatVND(item.base_price)}
                        </span>
                      </button>
                    ))}
                  </div>
                  {activeCategory?.menu_items.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      Không có món trong danh mục này
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </div>

          {/* Right Panel — Cart / Orders (hidden on mobile, shown inline on md+) */}
          <div className="hidden w-80 shrink-0 flex-col border-l bg-background md:flex lg:w-90">
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
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {cartQuantity}
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
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
                  onViewBill={(id) => setBillOrderId(id)}
                  onViewDetail={(id) => setOrderDetailId(id)}
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
                onRequestChangeTable={handleRequestChangeTable}
                onSubmitOrder={handleSubmitOrder}
                orderNote={orderNote}
                onOrderNoteChange={setOrderNote}
              />
            )}
          </div>

          {/* Mobile FAB — opens cart drawer (visible only <md) */}
          {isMobile && (
            <button
              type="button"
              className="touch-target-lg fixed bottom-6 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
              onClick={() => setCartDrawerOpen(true)}
              aria-label="Mở giỏ hàng"
            >
              <ShoppingCart className="size-5" />
              {cartQuantity > 0 && (
                <>
                  <span className="tabular-nums">{cartQuantity}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{formatVND(cartTotal)}</span>
                </>
              )}
            </button>
          )}

          {/* Mobile Cart Drawer (visible only <md) */}
          {isMobile && (
            <Drawer
              open={cartDrawerOpen}
              onOpenChange={setCartDrawerOpen}
              shouldScaleBackground={false}
            >
              <DrawerContent className="max-h-drawer">
                <DrawerTitle className="sr-only">Giỏ hàng</DrawerTitle>
                <div className="max-h-drawer-inner flex flex-col overflow-hidden">
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
                          "touch-target flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          !showOrders
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => setShowOrders(false)}
                      >
                        Giỏ hàng
                        {cartItems.length > 0 && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                            {cartQuantity}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showOrders}
                        className={cn(
                          "touch-target flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
                        onViewBill={(id) => setBillOrderId(id)}
                        onViewDetail={(id) => setOrderDetailId(id)}
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
                      onRequestChangeTable={handleRequestChangeTable}
                      onSubmitOrder={() => {
                        handleSubmitOrder();
                        setCartDrawerOpen(false);
                      }}
                      orderNote={orderNote}
                      onOrderNoteChange={setOrderNote}
                    />
                  )}
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </>
      )}

      {/* Item Customizer Sheet */}
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

      {/* Close Session Dialog */}
      <CloseSessionDialog
        sessionId={session.id}
        open={showCloseSession}
        onOpenChange={setShowCloseSession}
      />

      {/* Bill Receipt Sheet */}
      <BillReceipt
        branchId={branchId}
        orderId={billOrderId}
        onClose={() => setBillOrderId(null)}
      />
    </>
  );
}
