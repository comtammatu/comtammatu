"use client";

import { useEffect, useMemo, useState } from "react";
import { PRODUCT_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { AppEmptyState } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card } from "@comtammatu/ui/components/card";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Check as IconCheck, ChefHat as IconChefHat } from "lucide-react";
import { OrderCard } from "../order-card";
import { useBoardTick } from "../hooks/use-board-tick";
import { keepCurrentOrderFirst } from "../lib/current-order";
import { getAgeStyle, getCardLeftAccent } from "../lib/age-style";
import {
  getItemRowStatusClass,
  getQuantityStatusClass,
} from "../lib/item-status-style";
import {
  getStatusLabel,
  getStatusVariant,
  shouldShowTicketStatusBadge,
} from "../lib/status-config";
import { OrderTitleLine } from "./order-title-line";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsOrderItem, KdsTicket } from "../types";

const KDS_HEATMAP_LABELS = {
  append: "Gọi thêm",
  priority: "Ưu tiên",
} as const;

interface OrderGridProps {
  displayOrders: KdsOrder[];
  hasGroupedOrders: boolean;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}

function getOverallStatus(order: KdsOrder): string {
  const statuses = order.tickets.map((ticket) => ticket.status);
  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "cancelled")
  ) {
    return "cancelled";
  }
  if (statuses.some((status) => status === "preparing")) return "preparing";
  if (statuses.some((status) => status === "pending")) return "pending";
  if (statuses.some((status) => status === "ready")) return "ready";
  return "pending";
}

function getOrderElapsedMinutes(order: KdsOrder, now: number): number {
  return Math.max(
    0,
    Math.floor((now - new Date(order.createdAt).getTime()) / 60000),
  );
}

function CompactItemRow({
  item,
  ticket,
  pendingTicketIds,
  canMarkReady,
  onCompleteTickets,
}: {
  item: KdsOrderItem;
  ticket: KdsTicket | undefined;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}) {
  const status = ticket?.status ?? item.status;
  const isMutating = ticket ? pendingTicketIds.has(ticket.id) : false;
  const canComplete =
    canMarkReady &&
    ticket !== undefined &&
    (status === "pending" || status === "preparing");

  return (
    <div
      data-testid={`kds-heatmap-item-${String(item.id)}`}
      className={cn(
        "grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-border/40 py-1.5 first:border-t-0 first:pt-0 last:pb-0",
        getItemRowStatusClass(status),
      )}
    >
      <div
        className={cn(
          "flex h-8 w-12 shrink-0 items-center justify-center rounded-md px-2 ring-1 ring-inset",
          getQuantityStatusClass(status),
        )}
      >
        <span className="font-mono text-xl font-semibold leading-none tabular-nums">
          {item.quantity}×
        </span>
      </div>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="min-w-0 break-words text-base font-semibold leading-5">
          {item.item_name}
        </span>
        {item.is_priority && (
          <Badge
            variant="warning"
            className="h-5 rounded-md px-1.5 py-0 text-xs leading-none"
          >
            {KDS_HEATMAP_LABELS.priority}
          </Badge>
        )}
        {item.variant_name && (
          <span className="min-w-0 break-words text-xs font-medium leading-4 text-muted-foreground">
            {item.variant_name}
          </span>
        )}
        <TicketRowMeta
          layout="inline"
          note={item.note}
          modifiers={item.modifiers}
          sides={item.sides}
        />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {shouldShowTicketStatusBadge(status) && (
          <Badge
            variant={getStatusVariant(status)}
            className="h-5 rounded-md px-2 py-0 text-xs font-semibold leading-none"
          >
            {getStatusLabel(status)}
          </Badge>
        )}
        {canComplete && (
          <Button
            data-testid={`kds-heatmap-complete-ticket-${String(ticket.id)}`}
            type="button"
            variant="default"
            size="touch"
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void onCompleteTickets([ticket.id])}
            aria-label={`Hoàn tất ${item.item_name}`}
          >
            {isMutating ? <Spinner /> : <IconCheck aria-hidden />}
          </Button>
        )}
      </div>
    </div>
  );
}

function CompactOrphanRow({
  ticket,
  pendingTicketIds,
  canMarkReady,
  onCompleteTickets,
}: {
  ticket: KdsTicket;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}) {
  const isMutating = pendingTicketIds.has(ticket.id);
  const canComplete =
    canMarkReady &&
    (ticket.status === "pending" || ticket.status === "preparing");

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border/40 py-1.5 first:border-t-0 first:pt-0 last:pb-0",
        getItemRowStatusClass(ticket.status),
      )}
    >
      <span className="min-w-0 break-words text-sm font-semibold leading-5 text-muted-foreground">
        {PRODUCT_VI.posItem} #{String(ticket.order_item_id)}
      </span>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {shouldShowTicketStatusBadge(ticket.status) && (
          <Badge
            variant={getStatusVariant(ticket.status)}
            className="h-5 rounded-md px-1.5 py-0 text-xs font-semibold leading-none"
          >
            {getStatusLabel(ticket.status)}
          </Badge>
        )}
        {canComplete && (
          <Button
            data-testid={`kds-heatmap-complete-ticket-${String(ticket.id)}`}
            type="button"
            variant="default"
            size="touch"
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void onCompleteTickets([ticket.id])}
            aria-label="Hoàn tất món"
          >
            {isMutating ? <Spinner /> : <IconCheck aria-hidden />}
          </Button>
        )}
      </div>
    </div>
  );
}

function HeatmapCard({
  order,
  pendingTicketIds,
  canMarkReady,
  onCompleteTickets,
}: {
  order: KdsOrder;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}) {
  const now = useBoardTick();
  const elapsed = useMemo(
    () => getOrderElapsedMinutes(order, now),
    [now, order],
  );
  const status = getOverallStatus(order);
  const ageStyle = getAgeStyle(elapsed, status === "ready");
  const isAppend = order.sendKind === "append";
  const ticketByItemId = useMemo(() => {
    const map = new Map<number, KdsTicket>();
    for (const ticket of order.tickets) {
      map.set(ticket.order_item_id, ticket);
    }
    return map;
  }, [order.tickets]);
  const orphanTickets = useMemo(
    () =>
      order.tickets.filter(
        (ticket) =>
          !order.items.some((item) => item.id === ticket.order_item_id),
      ),
    [order.items, order.tickets],
  );

  return (
    <Card
      data-testid={`kds-heatmap-card-${order.groupKey}`}
      className={cn(
        "min-w-0 gap-0 overflow-hidden border-l-2 p-3",
        ageStyle.bg,
        getCardLeftAccent(status, elapsed),
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <OrderTitleLine
            kitchenTicketNumber={order.kitchenTicketNumber}
            orderNumber={order.orderNumber}
            orderType={order.orderType}
            tableNumber={order.tableNumber}
            size="compact"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isAppend && (
              <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                {KDS_HEATMAP_LABELS.append}
              </Badge>
            )}
            {order.isPriority && (
              <Badge variant="warning" className="px-2 py-0.5 text-xs">
                {KDS_HEATMAP_LABELS.priority}
              </Badge>
            )}
          </div>
        </div>
        <Badge
          variant={getStatusVariant(status)}
          className="shrink-0 px-2 py-1 text-xs font-semibold"
        >
          {elapsed}p
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {shouldShowTicketStatusBadge(status) && (
          <Badge
            variant={getStatusVariant(status)}
            className="px-2 py-0.5 text-xs"
          >
            {getStatusLabel(status)}
          </Badge>
        )}
      </div>
      <div className="mt-3 min-w-0 rounded-md border border-border/50 bg-card/70 p-2">
        {order.items.map((item) => (
          <CompactItemRow
            key={item.id}
            item={item}
            ticket={ticketByItemId.get(item.id)}
            pendingTicketIds={pendingTicketIds}
            canMarkReady={canMarkReady}
            onCompleteTickets={onCompleteTickets}
          />
        ))}
        {orphanTickets.map((ticket) => (
          <CompactOrphanRow
            key={ticket.id}
            ticket={ticket}
            pendingTicketIds={pendingTicketIds}
            canMarkReady={canMarkReady}
            onCompleteTickets={onCompleteTickets}
          />
        ))}
      </div>
    </Card>
  );
}

/** Comprehensive (TOÀN DIỆN) view: masonry grid of order cards. */
export function OrderGrid({
  displayOrders,
  hasGroupedOrders,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
}: OrderGridProps) {
  const [currentGroupKey, setCurrentGroupKey] = useState<string | null>(null);
  const orderedDisplay = useMemo(
    () => keepCurrentOrderFirst(displayOrders, currentGroupKey),
    [currentGroupKey, displayOrders],
  );

  useEffect(() => {
    if (orderedDisplay.currentGroupKey !== currentGroupKey) {
      setCurrentGroupKey(orderedDisplay.currentGroupKey);
    }
  }, [currentGroupKey, orderedDisplay.currentGroupKey]);

  const currentOrder = orderedDisplay.orders[0] ?? null;
  const nextOrders =
    currentOrder === null ? [] : orderedDisplay.orders.slice(1);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
      {displayOrders.length === 0 ? (
        <div className="flex min-h-80 items-center justify-center p-6 md:min-h-96">
          <AppEmptyState
            title={
              hasGroupedOrders ? "Không có đơn phù hợp bộ lọc" : "Bếp đang rảnh"
            }
            description={
              hasGroupedOrders
                ? "Thay đổi bộ lọc để xem thêm đơn."
                : "Chưa có đơn hàng mới."
            }
            icon={<IconChefHat />}
          />
        </div>
      ) : (
        <div className="grid min-h-full gap-2 p-2 lg:h-full lg:min-h-0 lg:grid-cols-5 lg:overflow-hidden">
          <div
            data-testid="kds-current-order-panel"
            className="min-h-0 lg:col-span-3 lg:h-full lg:overflow-y-auto lg:pr-1"
          >
            {currentOrder && (
              <OrderCard
                order={currentOrder}
                onRecall={onRecall}
                onOutOfStock={onOutOfStock}
                onCompleteTickets={onCompleteTickets}
                pendingTicketIds={pendingTicketIds}
                canMarkReady={canMarkReady}
                canRecall={canRecall}
              />
            )}
          </div>

          <div
            data-testid="kds-next-order-heatmap"
            className="grid h-fit min-w-0 auto-rows-max content-start gap-2 sm:grid-cols-2 lg:col-span-2 lg:h-full lg:min-h-0 lg:grid-cols-1 lg:overflow-y-auto lg:pr-1 2xl:grid-cols-2"
          >
            {nextOrders.map((order) => (
              <HeatmapCard
                key={order.groupKey}
                order={order}
                pendingTicketIds={pendingTicketIds}
                canMarkReady={canMarkReady}
                onCompleteTickets={onCompleteTickets}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
