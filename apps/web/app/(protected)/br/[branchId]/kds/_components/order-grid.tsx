"use client";

import { memo, useMemo } from "react";
import { PRODUCT_VI, KDS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { AppEmptyState, OperationalBoardCard } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Item } from "@comtammatu/ui/components/item";
import { StatusBadge } from "@/components/status-badge";
import {
  Check as IconCheck,
  RotateCcw as IconRotate,
} from "lucide-react";
import { useBoardTick } from "../_hooks/use-board-tick";
import {
  getItemRowStatusClass,
  getQuantityStatusClass,
} from "../_lib/item-status-style";
import {
  getKdsRowEffectClass,
  useKdsRowEffect,
} from "../_hooks/use-kds-row-effects";
import {
  getKdsNewTicketSignalClass,
  useKdsNewTicketSignalIds,
} from "../_hooks/use-kds-new-ticket-signal";
import {
  groupKdsOrdersByColumn,
  type KdsOrderColumn,
} from "../_lib/order-columns";
import {
  getKdsOrderDisplayStatus,
  isKdsActiveTicketStatus,
} from "../_lib/order-status";
import {
  KDS_ITEM_NAME_CLASS,
  shouldShowTicketStatusBadge,
} from "../_lib/status-config";
import { BatchActions } from "./batch-actions";
import { KdsTicketHeader } from "./kds-ticket-header";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsOrderItem, KdsTicket } from "../types";

const KDS_HEATMAP_LABELS = {
  completeItem: "Hoàn tất món",
  completeNamedItem: (itemName: string) => `Hoàn tất ${itemName}`,
  completeVisible: "Xong",
  priority: "Ưu tiên",
  recallItem: "Thu hồi món",
  recallNamedItem: (itemName: string) => `Thu hồi ${itemName}`,
} as const;

interface OrderGridProps {
  displayOrders: KdsOrder[];
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}

function getOrderElapsedMs(order: KdsOrder, now: number): number {
  return Math.max(0, now - new Date(order.createdAt).getTime());
}

const CompactItemRow = memo(function CompactItemRow({
  item,
  ticket,
  isMutating,
  canMarkReady,
  canRecall,
  onCompleteTickets,
  onRecall,
}: {
  item: KdsOrderItem;
  ticket: KdsTicket | undefined;
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}) {
  const status = ticket?.status ?? item.status;
  const isCancelled = status === "cancelled";
  const canCompleteByStatus = !isCancelled && isKdsActiveTicketStatus(status);
  const canRecallByStatus = !isCancelled && status === "ready";
  const canComplete = canCompleteByStatus && canMarkReady && ticket != null;
  const allowRecall = canRecallByStatus && canRecall && ticket != null;
  const rowEffect = useKdsRowEffect(ticket?.id);

  return (
    <Item
      data-testid={`kds-heatmap-item-${String(item.id)}`}
      data-kds-effect={rowEffect ?? undefined}
      className={cn(
        "grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 rounded-none border-x-0 border-b-0 border-t border-border/40 p-0 py-2 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[3.25rem_minmax(0,1fr)_auto] xl:items-start",
        getItemRowStatusClass(status),
        getKdsRowEffectClass(rowEffect),
      )}
    >
      <div
        className={cn(
          "flex h-8 w-11 shrink-0 items-center justify-center rounded-md px-1.5 ring-1 ring-inset xl:h-9 xl:w-12",
          getQuantityStatusClass(status),
        )}
      >
        <span className="font-mono text-xl font-semibold leading-none tabular-nums xl:text-2xl">
          {item.quantity}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span
            className={cn(
              "min-w-0 break-words font-heading font-semibold text-foreground",
              KDS_ITEM_NAME_CLASS,
              status === "ready" && "line-through opacity-50",
            )}
          >
            {item.item_name}
          </span>
          {item.is_priority && (
            <Badge
              variant="warning"
              className="h-5 rounded-md px-2 py-0 text-xs font-semibold leading-none xl:h-6 xl:text-sm"
            >
              {KDS_HEATMAP_LABELS.priority}
            </Badge>
          )}
          {item.variant_name && (
            <span className="min-w-0 break-words text-xs font-medium leading-4 text-muted-foreground xl:text-sm xl:leading-5">
              ({item.variant_name})
            </span>
          )}
        </div>
        <TicketRowMeta
          layout="stacked"
          note={item.note}
          modifiers={item.modifiers}
          sides={item.sides}
        />
      </div>
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">
        {shouldShowTicketStatusBadge(status) && (
          <StatusBadge
            domain="order-item"
            value={status}
            className="h-5 px-2 py-0 text-xs font-semibold leading-none xl:h-6 xl:px-2.5 xl:text-sm"
          />
        )}
        {ticket && allowRecall && (
          <Button
            data-testid={`kds-recall-${String(ticket.id)}`}
            type="button"
            variant="outline"
            size="touch"
            className="w-11 px-0 xl:w-12"
            disabled={isMutating}
            onClick={() => void onRecall(ticket.id)}
            aria-label={KDS_HEATMAP_LABELS.recallNamedItem(item.item_name)}
          >
            {isMutating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconRotate data-icon="inline-start" aria-hidden />
            )}
          </Button>
        )}
        {canComplete && (
          <Button
            data-testid={`kds-heatmap-complete-ticket-${String(ticket.id)}`}
            type="button"
            variant="default"
            size="touch"
            className="px-2 xl:px-2.5"
            disabled={isMutating}
            onClick={() => void onCompleteTickets([ticket.id])}
            aria-label={KDS_HEATMAP_LABELS.completeNamedItem(item.item_name)}
          >
            {isMutating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" aria-hidden />
            )}
            {KDS_HEATMAP_LABELS.completeVisible}
          </Button>
        )}
      </div>
    </Item>
  );
});

const CompactOrphanRow = memo(function CompactOrphanRow({
  ticket,
  isMutating,
  canMarkReady,
  canRecall,
  onCompleteTickets,
  onRecall,
}: {
  ticket: KdsTicket;
  isMutating: boolean;
  canMarkReady: boolean;
  canRecall: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}) {
  const isCancelled = ticket.status === "cancelled";
  const canCompleteByStatus =
    !isCancelled && isKdsActiveTicketStatus(ticket.status);
  const canRecallByStatus = !isCancelled && ticket.status === "ready";
  const canComplete = canCompleteByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;
  const rowEffect = useKdsRowEffect(ticket.id);

  return (
    <Item
      data-kds-effect={rowEffect ?? undefined}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-1.5 rounded-none border-x-0 border-b-0 border-t border-border/40 p-0 py-1.5 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-2 xl:py-2",
        getItemRowStatusClass(ticket.status),
        getKdsRowEffectClass(rowEffect),
      )}
    >
      <span
        className={cn(
          "min-w-0 break-words text-muted-foreground",
          KDS_ITEM_NAME_CLASS,
        )}
      >
        {PRODUCT_VI.posItem} #{String(ticket.order_item_id)}
      </span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 xl:shrink-0 xl:flex-nowrap">
        {shouldShowTicketStatusBadge(ticket.status) && (
          <StatusBadge
            domain="order-item"
            value={ticket.status}
            className="h-5 px-2 py-0 text-xs font-semibold leading-none xl:h-6 xl:px-2.5 xl:text-sm"
          />
        )}
        {allowRecall && (
          <Button
            data-testid={`kds-recall-${String(ticket.id)}`}
            type="button"
            variant="outline"
            size="touch"
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void onRecall(ticket.id)}
            aria-label={KDS_HEATMAP_LABELS.recallItem}
          >
            {isMutating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconRotate data-icon="inline-start" aria-hidden />
            )}
          </Button>
        )}
        {canComplete && (
          <Button
            data-testid={`kds-heatmap-complete-ticket-${String(ticket.id)}`}
            type="button"
            variant="default"
            size="touch"
            className="px-2"
            disabled={isMutating}
            onClick={() => void onCompleteTickets([ticket.id])}
            aria-label={KDS_HEATMAP_LABELS.completeItem}
          >
            {isMutating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" aria-hidden />
            )}
            {KDS_HEATMAP_LABELS.completeVisible}
          </Button>
        )}
      </div>
    </Item>
  );
});

function HeatmapCard({
  order,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onRecall,
  onCompleteTickets,
  isCurrent,
}: {
  order: KdsOrder;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  isCurrent: boolean;
}) {
  const now = useBoardTick();
  const elapsedMs = useMemo(() => getOrderElapsedMs(order, now), [now, order]);
  const newTicketSignalIds = useKdsNewTicketSignalIds();
  const isNewTicket = order.tickets.some((ticket) =>
    newTicketSignalIds.has(ticket.id),
  );
  const status = getKdsOrderDisplayStatus({ tickets: order.tickets });
  const showOrderStatusBadge = shouldShowTicketStatusBadge(status);
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
  const activeTickets = useMemo(
    () =>
      order.tickets.filter((ticket) => isKdsActiveTicketStatus(ticket.status)),
    [order.tickets],
  );

  return (
    <OperationalBoardCard
      data-testid={`kds-heatmap-card-${order.groupKey}`}
      data-kds-current={isCurrent ? "true" : undefined}
      current={isCurrent}
      currentTone="warning"
      className={cn(
        // shrink-0: Card sets overflow-hidden, which collapses a flex item's
        // auto min-height to 0 — without this the lane's flex column squeezes
        // cards instead of scrolling, clipping their content.
        "min-w-0 shrink-0 gap-1 overflow-hidden p-0",
        isNewTicket && getKdsNewTicketSignalClass(),
      )}
    >
      <KdsTicketHeader
        kitchenTicketNumber={order.kitchenTicketNumber}
        orderNumber={order.orderNumber}
        orderType={order.orderType}
        tableNumber={order.tableNumber}
        orderNote={order.orderNote}
        isPriority={order.isPriority}
        elapsedMs={elapsedMs}
        isComplete={status === "ready"}
        status={status}
        showStatusBadge={showOrderStatusBadge}
        density="compact"
        actions={
          canMarkReady ? (
            <BatchActions
              layout="title"
              orderGroupKey={order.groupKey}
              activeTickets={activeTickets}
              pendingTicketIds={pendingTicketIds}
              onCompleteTickets={onCompleteTickets}
            />
          ) : null
        }
      />
      <div className="flex min-w-0 flex-col px-2 xl:px-3">
        {order.items.map((item) => {
          const ticket = ticketByItemId.get(item.id);
          return (
            <CompactItemRow
              key={item.id}
              item={item}
              ticket={ticket}
              isMutating={ticket ? pendingTicketIds.has(ticket.id) : false}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              onCompleteTickets={onCompleteTickets}
              onRecall={onRecall}
            />
          );
        })}
        {orphanTickets.map((ticket) => (
          <CompactOrphanRow
            key={ticket.id}
            ticket={ticket}
            isMutating={pendingTicketIds.has(ticket.id)}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
            onCompleteTickets={onCompleteTickets}
            onRecall={onRecall}
          />
        ))}
      </div>
    </OperationalBoardCard>
  );
}

function OrderColumn({
  column,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onRecall,
  onCompleteTickets,
  currentGroupKey,
}: {
  column: KdsOrderColumn;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  currentGroupKey: string | null;
}) {
  return (
    <section
      data-testid={`kds-column-${column.id}`}
      className="flex min-h-0 min-w-0 flex-col xl:h-full"
      aria-label={column.title}
    >
      <div
        data-testid={`kds-column-list-${column.id}`}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1 pb-4 xl:gap-3.5"
      >
        {column.orders.length === 0 ? (
          <AppEmptyState
            data-testid={`kds-column-empty-${column.id}`}
            compact
            className="border-dashed bg-muted/30 px-3 py-3"
            title={column.emptyTitle}
          />
        ) : (
          column.orders.map((order) => (
            <HeatmapCard
              key={order.groupKey}
              order={order}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              onRecall={onRecall}
              onCompleteTickets={onCompleteTickets}
              isCurrent={order.groupKey === currentGroupKey}
            />
          ))
        )}
      </div>
    </section>
  );
}

/** Comprehensive (TOÀN DIỆN) view: kitchen queue split by service lane. */
export function OrderGrid({
  displayOrders,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onRecall,
  onCompleteTickets,
}: OrderGridProps) {
  const columns = useMemo(
    () => groupKdsOrdersByColumn(displayOrders),
    [displayOrders],
  );
  const currentGroupKey = displayOrders[0]?.groupKey ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden">
      {displayOrders.length === 0 ? (
        <div className="flex min-h-80 items-center justify-center p-4 md:min-h-96">
          <AppEmptyState
            title={KDS_VI.boardEmptyTitle}
            description={KDS_VI.boardEmptyDescription}
            symbol="riceBowl"
          />
        </div>
      ) : (
        <div
          data-testid="kds-order-columns"
          className="grid min-h-full grid-cols-1 gap-3 p-2.5 md:grid-cols-3 md:gap-3.5 md:p-3 xl:h-full xl:min-h-0 xl:grid-cols-3 xl:gap-4 xl:overflow-hidden xl:p-3.5"
        >
          {columns.map((column) => (
            <OrderColumn
              key={column.id}
              column={column}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              onRecall={onRecall}
              onCompleteTickets={onCompleteTickets}
              currentGroupKey={currentGroupKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
