"use client";

import { memo, useMemo, type ReactNode } from "react";
import { AppEmptyState, OperationalTile } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Plus as IconPlus,
  ShoppingBag as IconShoppingBag,
} from "lucide-react";
import { messages } from "@lib/messages";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import type { SessionOrder } from "./order-history";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
} from "./order-history";
import { getPosOrderStatusInfo } from "./_lib/order-status-display";

interface PosTakeawayGateProps {
  orders: SessionOrder[];
  onCreateNew: () => void;
  onViewDetail: (
    orderId: number,
    orderNumber: string,
    summary?: SessionOrder,
  ) => void;
  headerAction?: ReactNode;
  className?: string;
}

function isActiveTakeawayOrder(order: SessionOrder): boolean {
  return (
    order.order_type === "takeaway" &&
    order.payment_status !== "paid" &&
    ACTIVE_POS_STATUSES.includes(order.status)
  );
}

const TAKEAWAY_SEQUENCE_RE =
  /^(?:MV)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

function formatTakeawayTileNumber(orderNumber: string): string {
  const cleaned = orderNumber.trim().replace(/^#+/, "");
  const sequence = TAKEAWAY_SEQUENCE_RE.exec(cleaned)?.[1];
  return `#${sequence ?? cleaned}`;
}

function getTakeawayTileTone(order: SessionOrder) {
  if (order.status === "ready" || order.status === "served") return "success";
  return "warning";
}

function TakeawayOrderTile({
  order,
  onViewDetail,
}: {
  order: SessionOrder;
  onViewDetail: PosTakeawayGateProps["onViewDetail"];
}) {
  const statusInfo = getPosOrderStatusInfo(order);
  const displayNumber = formatTakeawayTileNumber(order.order_number);
  const customerName = order.note?.trim() ? order.note.trim() : null;

  return (
    <OperationalTile
      type="button"
      tone={getTakeawayTileTone(order)}
      size="tile"
      data-testid={`pos-takeaway-order-tile-${order.id}`}
      aria-label={
        customerName
          ? `${messages.pos.takeawayGate.orderAria(
              displayNumber,
              statusInfo.label,
              formatVND(order.total_amount),
            )}, ${messages.pos.takeawayGate.customerName(customerName)}`
          : messages.pos.takeawayGate.orderAria(
              displayNumber,
              statusInfo.label,
              formatVND(order.total_amount),
            )
      }
      className="w-full min-w-0 flex-col items-stretch justify-start gap-2 p-3 text-left whitespace-normal hover:shadow-sm sm:gap-3 lg:p-4"
      onClick={() => onViewDetail(order.id, order.order_number, order)}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-60 sm:text-sm">
          {messages.pos.takeawayGate.orderLabel}
        </p>
        <Badge
          variant={statusInfo.variant}
          className="min-w-0 truncate text-xs font-semibold"
        >
          {statusInfo.label}
        </Badge>
      </div>

      <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none tabular-nums">
            {displayNumber}
          </p>
          {customerName ? (
            <p className="mt-1 truncate text-sm font-medium text-foreground">
              {customerName}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {formatVNTime(order.created_at)}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1">
          {order.is_priority ? (
            <Badge variant="warning" className="text-xs font-semibold">
              {messages.pos.takeawayGate.priority}
            </Badge>
          ) : null}
          <p className="font-mono text-sm font-semibold tabular-nums text-primary">
            {formatVND(order.total_amount)}
          </p>
        </div>
      </div>
    </OperationalTile>
  );
}

function PosTakeawayGateComponent({
  orders,
  onCreateNew,
  onViewDetail,
  headerAction,
  className,
}: PosTakeawayGateProps) {
  const activeOrders = useMemo(
    () => orders.filter(isActiveTakeawayOrder).sort(compareOrdersByNextAction),
    [orders],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex w-full flex-col gap-4 px-2 pb-28 pt-2 md:px-4 md:py-4">
          {headerAction ? (
            <div className="w-full md:max-w-md">{headerAction}</div>
          ) : null}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <IconShoppingBag className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">
                    {messages.pos.takeawayGate.title}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5">
              <OperationalTile
                type="button"
                tone="default"
                size="tile"
                data-testid="pos-takeaway-create-tile"
                aria-label={messages.pos.takeawayGate.createNew}
                className="w-full min-w-0 flex-col items-stretch justify-start gap-2 p-3 text-left whitespace-normal hover:shadow-sm sm:gap-3 lg:p-4"
                onClick={onCreateNew}
              >
                <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
                  <p className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-60 sm:text-sm">
                    {messages.pos.takeawayGate.title}
                  </p>
                  <Badge variant="success" className="text-xs font-semibold">
                    {messages.pos.takeawayGate.newOrder}
                  </Badge>
                </div>

                <div className="mt-auto flex w-full min-w-0 items-end justify-between gap-2">
                  <p className="text-2xl font-semibold leading-none">
                    {messages.pos.takeawayGate.createTileLabel}
                  </p>
                  <IconPlus data-icon="inline-end" />
                </div>
              </OperationalTile>

              {activeOrders.map((order) => (
                <TakeawayOrderTile
                  key={order.id}
                  order={order}
                  onViewDetail={onViewDetail}
                />
              ))}
            </div>

            {activeOrders.length === 0 ? (
              <AppEmptyState
                title={messages.pos.takeawayGate.empty}
                compact
                icon={<IconShoppingBag />}
              />
            ) : null}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

export const PosTakeawayGate = memo(PosTakeawayGateComponent);
