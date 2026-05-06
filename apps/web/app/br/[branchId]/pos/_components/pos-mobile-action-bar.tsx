"use client";

import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  CreditCard as IconCreditCard,
  Plus as IconPlus,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { messages } from "@lib/messages";

export interface PosMobileActionBarProps {
  isMobile: boolean;
  isAppendingToOrder: boolean;
  menuContextReady: boolean;
  cartQuantity: number;
  appendDraftQuantity: number;
  ordersCount: number;
  awaitingPaymentOrderId: number | null;
  /** Opens the orders drawer view (refreshes then shows). */
  onOpenOrdersDrawer: () => void;
  /** Opens the cart drawer in its non-orders view. */
  onOpenCartDrawer: () => void;
  /** Opens the append-draft drawer while adding items to an existing order. */
  onOpenAppendDrawer: () => void;
  /** Opens the bill in payment mode for the most urgent unpaid order. */
  onOpenPayment: (orderId: number) => void;
}

const ACTION_BAR_CLASS =
  "fixed inset-x-3 bottom-0 z-40 flex gap-2 rounded-lg bg-card/95 p-2 shadow-2xl ring-1 ring-border backdrop-blur pos-safe-bottom md:hidden";

const ACTION_PRIMARY_BUTTON_CLASS =
  "min-h-14 min-w-14 flex-1 text-sm font-bold shadow-lg sm:text-base";

const ACTION_SECONDARY_BUTTON_CLASS =
  "min-h-14 min-w-14 flex-1 border border-border bg-secondary text-sm font-bold text-secondary-foreground shadow-lg sm:text-base";

function PosMobileActionBarComponent({
  isMobile,
  isAppendingToOrder,
  menuContextReady,
  cartQuantity,
  appendDraftQuantity,
  ordersCount,
  awaitingPaymentOrderId,
  onOpenOrdersDrawer,
  onOpenCartDrawer,
  onOpenAppendDrawer,
  onOpenPayment,
}: PosMobileActionBarProps) {
  if (!isMobile) return null;

  if (isAppendingToOrder) {
    return (
      <div className={ACTION_BAR_CLASS}>
        <Button
          type="button"
          className={ACTION_PRIMARY_BUTTON_CLASS}
          onClick={onOpenAppendDrawer}
          aria-label={messages.pos.mobileActionBar.openAppendAria}
        >
          <IconPlus data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.appendItems}</span>
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
    if (awaitingPaymentOrderId !== null) {
      return (
        <div className={ACTION_BAR_CLASS}>
          <Button
            type="button"
            className={ACTION_PRIMARY_BUTTON_CLASS}
            onClick={() => onOpenPayment(awaitingPaymentOrderId)}
            aria-label={messages.pos.mobileActionBar.openPayNowAria}
          >
            <IconCreditCard data-icon="inline-start" />
            <span>{messages.pos.mobileActionBar.payNow}</span>
          </Button>
        </div>
      );
    }

    return (
      <div className={ACTION_BAR_CLASS}>
        <Button
          type="button"
          variant="secondary"
          className={ACTION_SECONDARY_BUTTON_CLASS}
          onClick={onOpenOrdersDrawer}
        >
          <IconReceipt data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.sessionOrders}</span>
          {ordersCount > 0 && (
            <span className="tabular-nums">{ordersCount}</span>
          )}
        </Button>
      </div>
    );
  }

  // Cashier đang build giỏ — single CTA "Giỏ mới" giữ focus 1 task. Bỏ
  // "Đơn trong ca" để không pull đơn khác lên giữa lúc đặt món; cashier
  // xem orders qua sidebar/header khi cart trống.
  if (cartQuantity > 0) {
    return (
      <div className={ACTION_BAR_CLASS}>
        <Button
          type="button"
          className={ACTION_PRIMARY_BUTTON_CLASS}
          onClick={onOpenCartDrawer}
          aria-label={messages.pos.mobileActionBar.openNewCartAria}
        >
          <IconShoppingCart data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.newCart}</span>
          <span className="tabular-nums">{cartQuantity}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={ACTION_BAR_CLASS}>
      <Button
        type="button"
        className={ACTION_PRIMARY_BUTTON_CLASS}
        onClick={onOpenCartDrawer}
        aria-label={messages.pos.mobileActionBar.openNewCartAria}
      >
        <IconShoppingCart data-icon="inline-start" />
        <span>{messages.pos.mobileActionBar.newCart}</span>
      </Button>
      {awaitingPaymentOrderId !== null && (
        <Button
          type="button"
          variant="secondary"
          className={ACTION_SECONDARY_BUTTON_CLASS}
          onClick={() => onOpenPayment(awaitingPaymentOrderId)}
          aria-label={messages.pos.mobileActionBar.openPayNowAria}
        >
          <IconCreditCard data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.payNow}</span>
        </Button>
      )}
    </div>
  );
}

export const PosMobileActionBar = memo(PosMobileActionBarComponent);
