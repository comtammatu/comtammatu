"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { AppEmptyState } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Receipt as IconReceipt } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import type { SelfOrderPaymentCallKind } from "./self-order-actions";
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
import { getDeliveryPlatformLabelVi } from "@comtammatu/shared/labels";
import { DeliveryPlatformMark } from "@/components/delivery-platform-mark";
import type { BillReceiptIntent } from "./_components/bill/bill-receipt-types";
import { getPosOrderStatusInfo } from "./_lib/order-status-display";
import { deriveOrderTimingInfo } from "./_lib/table-timing";

export interface SessionOrder {
  id: number;
  order_number: string;
  order_type: string;
  delivery_platform: string | null;
  external_order_ref: string | null;
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
  note: string | null;
  is_priority: boolean;
  merged_into_order_id: number | null;
  split_from_order_id: number | null;
  created_at: string;
  updated_at: string;
  tables: { number: number } | null;
}

const ORDER_SEQUENCE_RE =
  /^(?:TC|MV|GH)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

function cleanOrderNumber(orderNumber: string): string {
  return orderNumber.trim().replace(/^#+/, "");
}

function extractOrderSequence(orderNumber: string): string | null {
  const match = ORDER_SEQUENCE_RE.exec(cleanOrderNumber(orderNumber));
  return match?.[1] ?? null;
}

function getOrderContextLabel(order: SessionOrder): string {
  if (order.order_type === "delivery") {
    return messages.pos.receipt.delivery;
  }
  if (order.order_type === "takeaway") {
    return messages.pos.orderHistory.takeaway;
  }
  if (order.tables?.number != null) {
    return messages.pos.orderHistory.dineIn(order.tables.number);
  }
  return messages.pos.orderDetail.genericOrderLabel;
}

function getCompactOrderTitle(
  order: SessionOrder,
  options: { showDineInSequence?: boolean } = {},
): string {
  const contextLabel = getOrderContextLabel(order);
  if (order.order_type === "takeaway" || order.order_type === "delivery") {
    const sequence = extractOrderSequence(order.order_number);
    if (sequence !== null) return `${contextLabel} #${sequence}`;

    const cleaned = cleanOrderNumber(order.order_number);
    return cleaned.length > 0 ? `${contextLabel} ${cleaned}` : contextLabel;
  }

  if (options.showDineInSequence === true) {
    const sequence = extractOrderSequence(order.order_number);
    if (sequence !== null) {
      return `${contextLabel} - ${messages.pos.orderHistory.orderSequence(
        sequence,
      )}`;
    }
  }

  return contextLabel;
}

const KITCHEN_WAITING_STATUSES = new Set(["new", "confirmed", "preparing"]);

export function compareOrdersByNextAction(
  a: SessionOrder,
  b: SessionOrder,
): number {
  // 1. Cờ ưu tiên (Khách giục / ưu tiên phục vụ)
  const byPriorityFlag = (b.is_priority ? 1 : 0) - (a.is_priority ? 1 : 0);
  if (byPriorityFlag !== 0) return byPriorityFlag;

  const aIsKitchenWaiting = KITCHEN_WAITING_STATUSES.has(a.status);
  const bIsKitchenWaiting = KITCHEN_WAITING_STATUSES.has(b.status);

  // 2. Nhóm đang chờ Bếp làm luôn xếp TRƯỚC nhóm đã ra món/đang ăn
  if (aIsKitchenWaiting && !bIsKitchenWaiting) return -1;
  if (!aIsKitchenWaiting && bIsKitchenWaiting) return 1;

  // 3. Trong nhóm đang chờ Bếp: đơn mang về / giao hàng ưu tiên nhẹ nếu cùng thời điểm
  if (aIsKitchenWaiting && bIsKitchenWaiting) {
    if (
      (a.order_type === "takeaway" || a.order_type === "delivery") &&
      b.order_type !== "takeaway" &&
      b.order_type !== "delivery"
    )
      return -1;
    if (
      (b.order_type === "takeaway" || b.order_type === "delivery") &&
      a.order_type !== "takeaway" &&
      a.order_type !== "delivery"
    )
      return 1;
  }

  // 4. Trong cùng nhóm: đơn vào lâu nhất xếp LÊN TRÊN (created_at cũ nhất trước - FIFO)
  const byCreatedAtOldestFirst =
    Date.parse(a.created_at) - Date.parse(b.created_at);
  if (byCreatedAtOldestFirst !== 0) return byCreatedAtOldestFirst;

  return a.id - b.id;
}

function formatTime(timestamp: string): string {
  return formatVNTime(timestamp, "--:--");
}

export function OrderStatePill({ order }: { order: SessionOrder }) {
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
  showDineInSequence = false,
  metaTimestamp,
}: {
  order: SessionOrder;
  amountClassName?: string;
  rightMeta: ReactNode;
  showDineInSequence?: boolean;
  /** Defaults to created_at. Archived rows pass updated_at (closed time). */
  metaTimestamp?: string;
}) {
  const deliveryAppRef = order.external_order_ref?.trim() ?? "";
  const deliveryIdentity =
    order.order_type === "delivery"
      ? [
          getDeliveryPlatformLabelVi(order.delivery_platform),
          deliveryAppRef.length > 0 ? deliveryAppRef : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" · ")
      : null;

  return (
    <ItemContent className="w-full min-w-0 gap-1.5">
      <ItemTitle className="w-full min-w-0 max-w-full justify-between gap-3 text-base">
        <span className="min-w-0 flex-1 truncate">
          {order.order_type === "delivery" && order.delivery_platform ? (
            <span className="inline-flex max-w-full items-center gap-1.5">
              <DeliveryPlatformMark
                platform={order.delivery_platform}
                size="xs"
              />
              <span className="truncate">
                {getCompactOrderTitle(order, { showDineInSequence })}
              </span>
            </span>
          ) : (
            getCompactOrderTitle(order, { showDineInSequence })
          )}
        </span>
        <span
          className={cn(
            "shrink-0 text-right font-bold tabular-nums",
            amountClassName ?? "text-foreground",
          )}
        >
          {formatVND(order.total_amount)}
        </span>
      </ItemTitle>
      <ItemDescription className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="min-w-0 truncate tabular-nums text-muted-foreground">
          {deliveryIdentity
            ? `${deliveryIdentity} · ${formatTime(metaTimestamp ?? order.created_at)}`
            : formatTime(metaTimestamp ?? order.created_at)}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
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

interface OrderCardProps {
  order: SessionOrder;
  showDineInSequence: boolean;
  paymentCall?: SelfOrderPaymentCallKind;
  onViewBill: (orderId: number, intent?: BillReceiptIntent) => void;
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary?: SessionOrder,
  ) => void;
}

const OrderCard = memo(function OrderCard({
  order,
  showDineInSequence,
  paymentCall,
  onViewBill,
  onViewDetail,
}: OrderCardProps) {
  const timing = deriveOrderTimingInfo(order);
  const isCooking = KITCHEN_WAITING_STATUSES.has(order.status);

  return (
    <Item
      data-testid={`pos-order-card-${order.id}`}
      variant="outline"
      size="sm"
      role="listitem"
      className="w-full max-w-full min-w-0 flex-col items-stretch overflow-hidden bg-card"
    >
      <OrderCardSummary
        order={order}
        amountClassName="text-primary"
        showDineInSequence={showDineInSequence}
        rightMeta={
          <>
            {order.is_priority ? (
              <Badge variant="warning" className="text-xs font-semibold">
                {messages.pos.orderHistory.priority}
              </Badge>
            ) : null}
            {paymentCall === "cash_call" ? (
              <Badge variant="warning" className="text-xs font-semibold">
                {SELF_ORDER_VI.cashCallStaff}
              </Badge>
            ) : paymentCall === "vietqr_pending" ? (
              <Badge variant="warning" className="text-xs font-semibold">
                {SELF_ORDER_VI.vietQrPendingStaff}
              </Badge>
            ) : null}
            {isCooking ? (
              timing.kitchenLatencyTone === "urgent" && timing.elapsedDuration ? (
                <Badge variant="destructive" className="text-xs font-semibold">
                  {messages.pos.orderHistory.overdueElapsed(timing.elapsedDuration)}
                </Badge>
              ) : timing.kitchenLatencyTone === "warning" && timing.elapsedDuration ? (
                <Badge variant="warning" className="text-xs font-semibold">
                  {messages.pos.orderHistory.waitingElapsed(timing.elapsedDuration)}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-warning/20 bg-warning/10 text-xs font-semibold text-warning"
                >
                  {messages.pos.orderHistory.waitingElapsed(timing.elapsedDuration ?? "1p")}
                </Badge>
              )
            ) : (
              <Badge variant="secondary" className="text-xs font-semibold">
                {messages.pos.tableGate.diningTime(timing.elapsedDuration ?? "1p")}
              </Badge>
            )}
          </>
        }
      />
      <ItemFooter className="mt-1.5 grid w-full min-w-0 grid-cols-2 gap-2 border-t border-border/60 pt-2">
        <Button
          data-testid={`pos-order-detail-${order.id}`}
          variant="outline"
          size="touch"
          className="w-full min-w-0 px-2 text-sm"
          onClick={() => onViewDetail(order.id, order.order_number, order)}
        >
          {messages.pos.orderHistory.handleOrder}
        </Button>
        <Button
          data-testid={`pos-order-bill-${order.id}`}
          variant="default"
          size="touch"
          className="w-full min-w-0 px-2 text-sm"
          onClick={() => onViewBill(order.id, "payment")}
        >
          <IconReceipt data-icon="inline-start" />
          {messages.pos.orderHistory.payment}
        </Button>
      </ItemFooter>
    </Item>
  );
});

interface ActiveOrdersListProps {
  orders: SessionOrder[];
  paymentCallByOrderId?: ReadonlyMap<number, SelfOrderPaymentCallKind>;
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
}

export type ActiveOrderFilterTab = "all" | "cooking" | "dineIn" | "takeaway";

/**
 * Sidebar list of orders the cashier still needs to act on (kitchen flow
 * + payment). Provider holds active rows only; archived ("Đơn hoàn thành") lives
 * in `_components/archived-orders-sheet.tsx`. We still defensively filter
 * by status because the provider can briefly show a paid row between the
 * realtime payload arriving and the terminal-flip removal landing.
 */
function ActiveOrdersListComponent({
  orders,
  paymentCallByOrderId,
  onViewBill,
  onViewDetail,
}: ActiveOrdersListProps) {
  const [activeTab, setActiveTab] = useState<ActiveOrderFilterTab>("all");

  const allActiveOrders = useMemo(
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

  const tabCounts = useMemo(() => {
    let cooking = 0;
    let dineIn = 0;
    let takeaway = 0;
    for (const order of allActiveOrders) {
      if (KITCHEN_WAITING_STATUSES.has(order.status)) {
        cooking += 1;
      }
      if (order.order_type === "dine_in") {
        dineIn += 1;
      }
      if (order.order_type === "takeaway" || order.order_type === "delivery") {
        takeaway += 1;
      }
    }
    return {
      all: allActiveOrders.length,
      cooking,
      dineIn,
      takeaway,
    };
  }, [allActiveOrders]);

  const activeOrders = useMemo(() => {
    switch (activeTab) {
      case "cooking":
        return allActiveOrders.filter((order) =>
          KITCHEN_WAITING_STATUSES.has(order.status),
        );
      case "dineIn":
        return allActiveOrders.filter(
          (order) => order.order_type === "dine_in",
        );
      case "takeaway":
        return allActiveOrders.filter(
          (order) =>
            order.order_type === "takeaway" || order.order_type === "delivery",
        );
      case "all":
      default:
        return allActiveOrders;
    }
  }, [allActiveOrders, activeTab]);

  const multiOrderTableIds = useMemo(() => {
    const counts = new Map<number, number>();
    for (const order of activeOrders) {
      if (order.order_type !== "dine_in" || order.table_id === null) continue;
      counts.set(order.table_id, (counts.get(order.table_id) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts)
        .filter(([, count]) => count > 1)
        .map(([tableId]) => tableId),
    );
  }, [activeOrders]);

  if (allActiveOrders.length === 0) {
    return (
      <AppEmptyState
        title={messages.pos.orderHistory.empty}
        icon={<IconReceipt />}
        className="flex-1"
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/60 p-2">
        <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-0.5 text-xs font-medium">
          <Button
            type="button"
            variant={activeTab === "all" ? "default" : "ghost"}
            size="sm"
            data-testid="pos-order-tab-all"
            className={cn(
              "h-8 px-1 text-xs font-medium",
              activeTab === "all"
                ? "bg-background font-semibold text-foreground shadow-2xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("all")}
          >
            <span>{messages.pos.orderHistory.tabs.all}</span>
            <span className="tabular-nums opacity-75">({tabCounts.all})</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === "cooking" ? "default" : "ghost"}
            size="sm"
            data-testid="pos-order-tab-cooking"
            className={cn(
              "h-8 px-1 text-xs font-medium",
              activeTab === "cooking"
                ? "bg-background font-semibold text-foreground shadow-2xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("cooking")}
          >
            <span>{messages.pos.orderHistory.tabs.cooking}</span>
            <span className="tabular-nums opacity-75">({tabCounts.cooking})</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === "dineIn" ? "default" : "ghost"}
            size="sm"
            data-testid="pos-order-tab-dinein"
            className={cn(
              "h-8 px-1 text-xs font-medium",
              activeTab === "dineIn"
                ? "bg-background font-semibold text-foreground shadow-2xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("dineIn")}
          >
            <span>{messages.pos.orderHistory.tabs.dineIn}</span>
            <span className="tabular-nums opacity-75">({tabCounts.dineIn})</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === "takeaway" ? "default" : "ghost"}
            size="sm"
            data-testid="pos-order-tab-takeaway"
            className={cn(
              "h-8 px-1 text-xs font-medium",
              activeTab === "takeaway"
                ? "bg-background font-semibold text-foreground shadow-2xs hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("takeaway")}
          >
            <span>{messages.pos.orderHistory.tabs.takeaway}</span>
            <span className="tabular-nums opacity-75">({tabCounts.takeaway})</span>
          </Button>
        </div>
      </div>

      {activeOrders.length === 0 ? (
        <AppEmptyState
          title={messages.pos.orderHistory.tabEmpty[activeTab]}
          icon={<IconReceipt />}
          className="flex-1"
        />
      ) : (
        <ScrollArea className="min-h-0 min-w-0 w-full flex-1 overflow-hidden">
          <div className="flex w-full min-w-0 max-w-full flex-col gap-3 px-3 pb-4 pt-2 md:p-2">
            <ItemGroup className="w-full min-w-0 gap-2">
              {activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  showDineInSequence={
                    order.table_id !== null &&
                    multiOrderTableIds.has(order.table_id)
                  }
                  paymentCall={paymentCallByOrderId?.get(order.id)}
                  onViewBill={onViewBill}
                  onViewDetail={onViewDetail}
                />
              ))}
            </ItemGroup>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export const ActiveOrdersList = memo(ActiveOrdersListComponent);
