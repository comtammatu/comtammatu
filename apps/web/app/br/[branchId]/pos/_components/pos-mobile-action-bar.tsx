"use client";

import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  LayoutGrid as IconLayoutGrid,
  Plus as IconPlus,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
  Utensils as IconUtensils,
} from "lucide-react";
import type { OrderType } from "../types";

export interface PosMobileActionBarProps {
  isMobile: boolean;
  isAppendingToOrder: boolean;
  menuContextReady: boolean;
  cartOrderType: OrderType;
  selectedTableId: number | null;
  cartQuantity: number;
  appendDraftQuantity: number;
  ordersCount: number;
  /** Opens the orders drawer view (refreshes then shows). */
  onOpenOrdersDrawer: () => void;
  /**
   * "Đổi bàn" / "Chọn bàn" / "Tại bàn" — chuyển context bàn. Trước đây nằm
   * trên header dạng nút h-7 nhỏ, đã chen với "Thoát" + "Chốt ca" và bị
   * duplicate với icon LayoutGrid trong FAB. Gom về FAB để mỗi action có 1
   * nút duy nhất, đủ to cho ngón cái.
   */
  onSwitchTableMode: () => void;
  /** Opens the cart drawer in its non-orders view. */
  onOpenCartDrawer: () => void;
  /** Opens the append-draft drawer while adding items to an existing order. */
  onOpenAppendDrawer: () => void;
}

const ACTION_BAR_CLASS =
  "fixed inset-x-3 bottom-0 z-40 flex gap-2 border border-border bg-background/95 p-2 shadow-2xl backdrop-blur pos-safe-bottom md:hidden";

const ACTION_PRIMARY_BUTTON_CLASS =
  "min-h-14 min-w-14 flex-1 text-base font-bold shadow-lg";

const ACTION_SECONDARY_BUTTON_CLASS =
  "min-h-14 min-w-14 flex-1 border border-border bg-secondary text-base font-bold text-secondary-foreground shadow-lg";

function PosMobileActionBarComponent({
  isMobile,
  isAppendingToOrder,
  menuContextReady,
  cartOrderType,
  selectedTableId,
  cartQuantity,
  appendDraftQuantity,
  ordersCount,
  onOpenOrdersDrawer,
  onSwitchTableMode,
  onOpenCartDrawer,
  onOpenAppendDrawer,
}: PosMobileActionBarProps) {
  if (!isMobile) return null;

  if (isAppendingToOrder) {
    return (
      <div className={ACTION_BAR_CLASS}>
        <Button
          type="button"
          className={ACTION_PRIMARY_BUTTON_CLASS}
          onClick={onOpenAppendDrawer}
          aria-label="Mở món thêm"
        >
          <IconPlus data-icon="inline-start" />
          <span>Món thêm</span>
          {appendDraftQuantity > 0 && (
            <span className="tabular-nums">{appendDraftQuantity}</span>
          )}
        </Button>
      </div>
    );
  }

  // Chưa chọn bàn / chưa setup → CTA duy nhất là mở danh sách đơn trong ca,
  // tránh ngộ nhận có thể đặt món khi context chưa ready.
  if (!menuContextReady) {
    return (
      <div className={ACTION_BAR_CLASS}>
        <Button
          type="button"
          variant="secondary"
          className={ACTION_SECONDARY_BUTTON_CLASS}
          onClick={onOpenOrdersDrawer}
        >
          <IconReceipt data-icon="inline-start" />
          <span>Đơn trong ca</span>
          {ordersCount > 0 && (
            <span className="tabular-nums">{ordersCount}</span>
          )}
        </Button>
      </div>
    );
  }

  // Đã có context (Bàn N hoặc Mang về). 3 nút bằng nhau, đủ to cho ngón cái:
  //   [Đổi/Chọn bàn — outline]  [Đơn trong ca — outline]  [Giỏ mới — primary]
  // Nút "Đổi bàn" hiện cả khi đang "Mang về" (label "Chọn bàn") để cashier
  // chuyển nhanh sang dine-in mà không phải tìm trong header.
  const switchLabel = cartOrderType === "dine_in" ? "Đổi bàn" : "Chọn bàn";
  const SwitchIcon = cartOrderType === "dine_in" ? IconLayoutGrid : IconUtensils;

  return (
    <div className={ACTION_BAR_CLASS}>
      <Button
        type="button"
        variant="secondary"
        className={ACTION_SECONDARY_BUTTON_CLASS}
        onClick={onSwitchTableMode}
        aria-label={switchLabel}
        disabled={
          cartOrderType === "dine_in" && selectedTableId === null
        }
      >
        <SwitchIcon data-icon="inline-start" />
        <span>{switchLabel}</span>
      </Button>
      {ordersCount > 0 && (
        <Button
          type="button"
          variant="secondary"
          className={ACTION_SECONDARY_BUTTON_CLASS}
          onClick={onOpenOrdersDrawer}
          aria-label="Mở đơn trong ca"
        >
          <IconReceipt data-icon="inline-start" />
          <span>Đơn ca</span>
          <span className="tabular-nums">{ordersCount}</span>
        </Button>
      )}
      <Button
        type="button"
        className={ACTION_PRIMARY_BUTTON_CLASS}
        onClick={onOpenCartDrawer}
        aria-label="Mở giỏ đơn mới"
      >
        <IconShoppingCart data-icon="inline-start" />
        {cartQuantity > 0 ? (
          <>
            <span>Giỏ mới</span>
            <span className="tabular-nums">{cartQuantity}</span>
          </>
        ) : (
          <span>Giỏ mới</span>
        )}
      </Button>
    </div>
  );
}

export const PosMobileActionBar = memo(PosMobileActionBarComponent);
