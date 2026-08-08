"use client";

import { memo } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ChevronRight as IconChevronRight,
  Clock as IconClock,
  RefreshCw as IconRefresh,
  X as IconX,
} from "lucide-react";
import { ActiveOrdersList, type SessionOrder } from "../order-history";
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
}

function OrderListPaneComponent({
  onViewBill,
  onViewDetail,
  onClosePane,
  hideTakeawayOrders = false,
  onOpenArchivedSheet,
}: OrderListPaneProps) {
  const orders = usePosOrders();
  const { refreshOrders } = usePosOperationalDispatch();
  const displayedOrders = hideTakeawayOrders
    ? orders.filter((order) => order.order_type !== "takeaway")
    : orders;
  const activeOrderCount = displayedOrders.length;
  const title = hideTakeawayOrders
    ? messages.pos.orderHistory.dineInSessionOrders
    : messages.pos.orderHistory.sessionOrders;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
            size="icon-lg"
            className="text-muted-foreground"
            aria-label={messages.pos.orderHistory.refreshOrdersAria}
            onClick={() => void refreshOrders()}
          >
            <IconRefresh />
          </Button>
          {onClosePane ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="text-muted-foreground"
              aria-label={messages.pos.orderHistory.closeListAria}
              onClick={onClosePane}
            >
              <IconX />
            </Button>
          ) : null}
        </div>
      </div>

      <ActiveOrdersList
        orders={displayedOrders}
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
