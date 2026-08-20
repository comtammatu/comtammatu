"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ChevronRight as IconChevronRight,
  Clock as IconClock,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { ActiveOrdersList, type SessionOrder } from "../order-history";
import type { SelfOrderPaymentCallKind } from "../self-order-actions";
import type { BillReceiptIntent } from "./bill/bill-receipt-types";
import {
  usePosOperationalDispatch,
  usePosOrders,
} from "../_providers/pos-desktop-provider";
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
  onClosePane,
  hideTakeawayOrders = false,
  onOpenArchivedSheet,
  paymentCallByOrderId,
}: OrderListPaneProps) {
  const orders = usePosOrders();
  const { refreshOrders } = usePosOperationalDispatch();
  const displayedOrders = hideTakeawayOrders
    ? orders.filter((order) => order.order_type === "dine_in")
    : orders;
  const activeOrderCount = displayedOrders.length;
  const title = hideTakeawayOrders
    ? messages.pos.orderHistory.dineInSessionOrders
    : messages.pos.orderHistory.sessionOrders;

  const isMobileDrawer = onClosePane != null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {!isMobileDrawer ? (
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-base font-semibold">
              {title}
            </p>
            <Badge
              variant={activeOrderCount > 0 ? "secondary" : "outline"}
              className="h-6 min-w-6 px-1.5 text-sm font-bold tabular-nums"
              aria-label={messages.pos.orderHistory.activeCountAria(
                activeOrderCount,
              )}
            >
              {activeOrderCount}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              className="text-muted-foreground"
              aria-label={messages.pos.orderHistory.refreshOrdersAria}
              onClick={() => void refreshOrders()}
            >
              <IconRefresh />
            </Button>
          </div>
        </div>
      ) : null}

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
