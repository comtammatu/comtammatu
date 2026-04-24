"use client";

import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  IconLayoutGrid,
  IconReceipt,
  IconShoppingCart,
} from "@tabler/icons-react";
import type { OrderType } from "../types";

export interface PosMobileActionBarProps {
  isMobile: boolean;
  isAppendingToOrder: boolean;
  menuContextReady: boolean;
  cartOrderType: OrderType;
  selectedTableId: number | null;
  cartQuantity: number;
  ordersCount: number;
  /** Opens the orders drawer view (refreshes then shows). */
  onOpenOrdersDrawer: () => void;
  /** Jumps back to table picker (dine_in mode, table cleared). */
  onEnterTablePicker: () => void;
  /** Opens the cart drawer in its non-orders view. */
  onOpenCartDrawer: () => void;
}

function PosMobileActionBarComponent({
  isMobile,
  isAppendingToOrder,
  menuContextReady,
  cartOrderType,
  selectedTableId,
  cartQuantity,
  ordersCount,
  onOpenOrdersDrawer,
  onEnterTablePicker,
  onOpenCartDrawer,
}: PosMobileActionBarProps) {
  if (!isMobile || isAppendingToOrder) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex gap-2 md:hidden">
      {!menuContextReady && (
        <Button
          type="button"
          variant="secondary"
          className="min-h-14 min-w-14 flex-1 rounded-full text-base font-bold shadow-lg"
          onClick={onOpenOrdersDrawer}
        >
          <IconReceipt className="size-5" />
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
            className="min-h-14 min-w-14 rounded-full bg-background px-3 text-base font-bold shadow-lg"
            onClick={onEnterTablePicker}
            aria-label="Xem bàn"
          >
            <IconLayoutGrid className="size-5" />
          </Button>
        )}
      {menuContextReady && (
        <Button
          type="button"
          className="min-h-14 min-w-14 flex-1 rounded-full text-base font-bold shadow-lg"
          onClick={onOpenCartDrawer}
          aria-label="Mở giỏ hàng"
        >
          <IconShoppingCart className="size-5" />
          {cartQuantity > 0 ? (
            <>
              <span>Giỏ</span>
              <span className="tabular-nums">{cartQuantity}</span>
            </>
          ) : (
            <span>Giỏ mới</span>
          )}
        </Button>
      )}
    </div>
  );
}

export const PosMobileActionBar = memo(PosMobileActionBarComponent);
