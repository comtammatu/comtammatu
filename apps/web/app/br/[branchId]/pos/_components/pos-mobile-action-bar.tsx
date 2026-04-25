"use client";

import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  LayoutGrid as IconLayoutGrid,
  Plus as IconPlus,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
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
  /** Jumps back to table picker (dine_in mode, table cleared). */
  onEnterTablePicker: () => void;
  /** Opens the cart drawer in its non-orders view. */
  onOpenCartDrawer: () => void;
  /** Opens the append-draft drawer while adding items to an existing order. */
  onOpenAppendDrawer: () => void;
}

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
  onEnterTablePicker,
  onOpenCartDrawer,
  onOpenAppendDrawer,
}: PosMobileActionBarProps) {
  if (!isMobile) return null;

  if (isAppendingToOrder) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-40 flex gap-2 md:hidden">
        <Button
          type="button"
          className="min-h-14 min-w-14 flex-1 text-base font-bold shadow-lg"
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

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex gap-2 md:hidden">
      {!menuContextReady && (
        <Button
          type="button"
          variant="secondary"
          className="min-h-14 min-w-14 flex-1 text-base font-bold shadow-lg"
          onClick={onOpenOrdersDrawer}
        >
          <IconReceipt data-icon="inline-start" />
          <span>Đơn trong ca</span>
          {ordersCount > 0 && (
            <span className="tabular-nums">{ordersCount}</span>
          )}
        </Button>
      )}
      {menuContextReady &&
        cartOrderType === "dine_in" &&
        selectedTableId !== null && (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 min-w-14 bg-background px-3 text-base font-bold shadow-lg"
            onClick={onEnterTablePicker}
            aria-label="Xem bàn"
          >
            <IconLayoutGrid />
          </Button>
        )}
      {menuContextReady && (
        <Button
          type="button"
          className="min-h-14 min-w-14 flex-1 text-base font-bold shadow-lg"
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
            <span>Giỏ đơn mới</span>
          )}
        </Button>
      )}
    </div>
  );
}

export const PosMobileActionBar = memo(PosMobileActionBarComponent);
