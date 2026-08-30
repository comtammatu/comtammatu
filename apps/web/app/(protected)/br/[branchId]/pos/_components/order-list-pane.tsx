"use client";

import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  ChevronRight as IconChevronRight,
  Clock as IconClock,
} from "lucide-react";
import { ActiveOrdersList, type SessionOrder } from "../order-history";
import type { SelfOrderPaymentCallKind } from "../self-order-actions";
import type { BillReceiptIntent } from "./bill/bill-receipt-types";
import { usePosOrders } from "../_providers/pos-desktop-provider";
import { messages } from "@lib/messages";

interface OrderListPaneProps {
  onViewBill: (orderId: number, intent?: BillReceiptIntent) => void;
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary?: SessionOrder,
  ) => void;
  onClosePane?: () => void;
  hideTakeawayOrders?: boolean;
  /**
   * Opens the "Đơn hoàn thành" sheet (paid + cancelled orders, paginated).
   * Provided by the shell. Replaces the inline archived list — at scale
   * (200-300 đơn/ngày) the inline list dragged the sidebar's render and
   * pulled rows the cashier rarely touches.
   */
  onOpenArchivedSheet?: () => void;
  paymentCallByOrderId?: ReadonlyMap<number, SelfOrderPaymentCallKind>;
}

function OrderListPaneComponent({
  onViewBill,
  onViewDetail,
  onClosePane: _onClosePane,
  hideTakeawayOrders = false,
  onOpenArchivedSheet,
  paymentCallByOrderId,
}: OrderListPaneProps) {
  const orders = usePosOrders();
  const displayedOrders = hideTakeawayOrders
    ? orders.filter((order) => order.order_type === "dine_in")
    : orders;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ActiveOrdersList
        orders={displayedOrders}
        paymentCallByOrderId={paymentCallByOrderId}
        onViewBill={onViewBill}
        onViewDetail={onViewDetail}
      />

      {onOpenArchivedSheet ? (
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="shrink-0 justify-between rounded-none border-t border-border/60 px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
          data-testid="pos-archived-sheet-trigger"
          onClick={onOpenArchivedSheet}
        >
          <span className="flex items-center gap-2">
            <IconClock data-icon="inline-start" />
            {messages.pos.archivedOrders.trigger}
          </span>
          <IconChevronRight data-icon="inline-end" />
        </Button>
      ) : null}
    </div>
  );
}

export const OrderListPane = memo(OrderListPaneComponent);
