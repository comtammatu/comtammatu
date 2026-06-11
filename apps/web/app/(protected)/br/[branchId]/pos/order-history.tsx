"use client";

import { memo, useMemo, type ReactNode } from "react";
import { AppEmptyState } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ConciergeBell as IconConciergeBell,
  Receipt as IconReceipt,
} from "lucide-react";
import { messages } from "@lib/messages";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import type { BillReceiptIntent } from "./_components/bill/bill-receipt-types";
import { getPosOrderStatusInfo } from "./_lib/order-status-display";

export interface SessionOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  order_discount_amount: number;
  item_discount_amount: number;
  discount_type: string | null;
  discount_value: number | null;
  discount_note: string | null;
  total_amount: number;
  table_id: number | null;
  customer_count: number | null;
  note: string | null;
  is_priority: boolean;
  merged_into_order_id: number | null;
  split_from_order_id: number | null;
  created_at: string;
  tables: { number: number } | null;
}

function getOrderMetaLabel(order: SessionOrder): string {
  return `${getOrderContextLabel(order)} - ${formatTime(order.created_at)}`;
}

function compareOrdersNewestFirst(a: SessionOrder, b: SessionOrder): number {
  const byCreatedAt = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  return b.id - a.id;
}

function getOrderActionPriority(order: SessionOrder): number {
  if (order.payment_status === "paid") return 99;
  if (order.status === "served" || order.status === "ready") return 0;
  if (order.order_type === "takeaway") return 1;
  if (order.status === "preparing") return 2;
  if (order.status === "confirmed") return 3;
  if (order.status === "new") return 4;
  return 5;
}

export function compareOrdersByNextAction(
  a: SessionOrder,
  b: SessionOrder,
): number {
  const byKitchenPriority = Number(b.is_priority) - Number(a.is_priority);
  if (byKitchenPriority !== 0) return byKitchenPriority;

  const byPriority = getOrderActionPriority(a) - getOrderActionPriority(b);
  if (byPriority !== 0) return byPriority;

  return compareOrdersNewestFirst(a, b);
}

function formatTime(dateStr: string): string {
  return formatVNTime(dateStr);
}

function getOrderContextLabel(order: SessionOrder): string {
  if (order.order_type === "dine_in") {
    return messages.pos.orderHistory.dineIn(order.tables?.number ?? "—");
  }

  return messages.pos.orderHistory.takeaway;
}

export function OrderStatusBadge({ order }: { order: SessionOrder }) {
  const statusInfo = getPosOrderStatusInfo(order);

  return (
    <Badge
      variant={statusInfo.variant}
      className={cn(
        "text-sm font-semibold tabular-nums",
        statusInfo.variant === "outline" && "bg-background",
      )}
    >
      {statusInfo.label}
    </Badge>
  );
}

export function OrderCardSummary({
  order,
  amountClassName,
  rightMeta,
}: {
  order: SessionOrder;
  amountClassName?: string;
  rightMeta: ReactNode;
}) {
  return (
    <ItemContent className="w-full min-w-0 gap-1.5">
      <ItemTitle className="w-full min-w-0 justify-between gap-3 text-base">
        <span className="min-w-0 truncate">#{order.order_number}</span>
        <span
          className={cn(
            "shrink-0 text-right font-bold tabular-nums",
            amountClassName ?? "text-foreground",
          )}
        >
          {formatVND(order.total_amount)}
        </span>
      </ItemTitle>
      <ItemDescription className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="min-w-0 truncate">{getOrderMetaLabel(order)}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {rightMeta}
        </span>
      </ItemDescription>
    </ItemContent>
  );
}

export const ACTIVE_POS_STATUSES = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "served",
];

interface ActiveOrdersListProps {
  orders: SessionOrder[];
  onViewBill: (orderId: number, intent?: BillReceiptIntent) => void;
  /**
   * `summary` lets the detail sheet paint header (số đơn, bàn / mang về)
   * instantly while items stream in. The sheet falls back to its own
   * fetch when omitted, but the list always has the row in hand.
   */
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary?: SessionOrder,
  ) => void;
  /**
   * One-tap hand-off for `ready` rows. The detail-sheet path stays as
   * fallback when omitted.
   */
  onServeOrder?: (orderId: number) => void;
}

/**
 * Sidebar list of orders the cashier still needs to act on (kitchen flow
 * + payment). Provider holds active rows only; archived ("Đơn hoàn thành") lives
 * in `_components/archived-orders-sheet.tsx`. We still defensively filter
 * by status because the provider can briefly show a paid row between the
 * realtime payload arriving and the terminal-flip removal landing.
 */
function ActiveOrdersListComponent({
  orders,
  onViewBill,
  onViewDetail,
  onServeOrder,
}: ActiveOrdersListProps) {
  const activeOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            ACTIVE_POS_STATUSES.includes(order.status) &&
            order.payment_status !== "paid",
        )
        .sort(compareOrdersByNextAction),
    [orders],
  );

  if (activeOrders.length === 0) {
    return (
      <AppEmptyState
        title={messages.pos.orderHistory.empty}
        icon={<IconReceipt />}
        className="flex-1 px-6"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-2 px-3 pb-24 pt-2 md:p-2">
          <ItemGroup className="gap-2">
            {activeOrders.map((order) => {
              const waitingPayment = order.payment_status !== "paid";
              const showServe = order.status === "ready" && !!onServeOrder;

              return (
                <Item
                  key={order.id}
                  data-testid={`pos-order-card-${order.id}`}
                  variant="outline"
                  size="sm"
                  role="listitem"
                  className="bg-card"
                >
                  <OrderCardSummary
                    order={order}
                    amountClassName="text-primary"
                    rightMeta={
                      <>
                        {order.is_priority ? (
                          <Badge
                            variant="warning"
                            className="text-sm font-semibold"
                          >
                            Ưu tiên
                          </Badge>
                        ) : null}
                        <OrderStatusBadge order={order} />
                        {waitingPayment ? (
                          <Badge
                            variant="warning"
                            className="text-sm font-semibold"
                          >
                            {messages.pos.orderHistory.waitingPayment}
                          </Badge>
                        ) : null}
                      </>
                    }
                  />
                  <ItemFooter className="mt-1.5 justify-end border-t border-border/60 pt-2">
                    <Button
                      data-testid={`pos-order-detail-${order.id}`}
                      variant="outline"
                      size="touch"
                      className="px-3 text-sm"
                      onClick={() =>
                        onViewDetail(order.id, order.order_number, order)
                      }
                    >
                      {messages.pos.orderHistory.handleOrder}
                    </Button>
                    <Button
                      data-testid={`pos-order-bill-${order.id}`}
                      variant={showServe ? "outline" : "default"}
                      size="touch"
                      className="px-3 text-sm"
                      onClick={() => onViewBill(order.id, "payment")}
                    >
                      <IconReceipt data-icon="inline-start" />
                      {messages.pos.orderHistory.payment}
                    </Button>
                    {showServe ? (
                      <Button
                        data-testid={`pos-order-serve-${order.id}`}
                        variant="default"
                        size="touch"
                        className="px-3 text-sm"
                        onClick={() => onServeOrder(order.id)}
                      >
                        <IconConciergeBell data-icon="inline-start" />
                        {messages.pos.orderHistory.serve}
                      </Button>
                    ) : null}
                  </ItemFooter>
                </Item>
              );
            })}
          </ItemGroup>
        </div>
      </ScrollArea>
    </div>
  );
}

export const ActiveOrdersList = memo(ActiveOrdersListComponent);
