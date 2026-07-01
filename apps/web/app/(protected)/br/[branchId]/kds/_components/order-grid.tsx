"use client";

import { useMemo } from "react";
import { PRODUCT_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { AppEmptyState, OperationalBoardCard } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Item } from "@comtammatu/ui/components/item";
import { StatusBadge } from "@/components/status-badge";
import {
  Check as IconCheck,
  ChefHat as IconChefHat,
  RotateCcw as IconRotate,
} from "lucide-react";
import { useBoardTick } from "../_hooks/use-board-tick";
import { AgeBadge } from "./age-badge";
import { getAgeStyle, getCardLeftAccent } from "../_lib/age-style";
import {
  getItemRowStatusClass,
  getQuantityStatusClass,
} from "../_lib/item-status-style";
import {
  getKdsRowEffectClass,
  useKdsRowEffect,
} from "../_hooks/use-kds-row-effects";
import {
  getKdsOrderLabelOverride,
  groupKdsOrdersByColumn,
} from "../_lib/order-columns";
import {
  getKdsOrderDisplayStatus,
  isKdsActiveTicketStatus,
} from "../_lib/order-status";
import {
  shouldShowTicketStatusBadge,
} from "../_lib/status-config";
import { BatchActions } from "./batch-actions";
import { OrderNote } from "./order-note";
import { OrderTitleLine } from "./order-title-line";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsOrderItem, KdsTicket } from "../types";
import type { KdsOrderColumn } from "../_lib/order-columns";

const KDS_HEATMAP_LABELS = {
  completeItem: "Hoàn tất món",
  completeNamedItem: (itemName: string) => `Hoàn tất ${itemName}`,
  priority: "Ưu tiên",
  quantitySuffix: "×",
  recallItem: "Thu hồi món",
  recallNamedItem: (itemName: string) => `Thu hồi ${itemName}`,
} as const;

interface OrderGridProps {
  displayOrders: KdsOrder[];
  hasGroupedOrders: boolean;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
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
  canRecall,
  onCompleteTickets,
  onRecall,
}: {
  item: KdsOrderItem;
  ticket: KdsTicket | undefined;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}) {
  const status = ticket?.status ?? item.status;
  const isMutating = ticket ? pendingTicketIds.has(ticket.id) : false;
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
        "grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-1.5 gap-y-1 border-t border-border/40 py-1.5 transition-colors duration-150 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[3.5rem_minmax(0,1fr)_auto] xl:items-center xl:gap-2 xl:py-2 p-0 rounded-none border-x-0 border-b-0",
        getItemRowStatusClass(status),
        getKdsRowEffectClass(rowEffect),
      )}
    >
      <div
        className={cn(
          "flex h-8 w-12 shrink-0 items-center justify-center rounded-md px-2 ring-1 ring-inset xl:h-9 xl:w-14",
          getQuantityStatusClass(status),
        )}
      >
        <span className="font-mono text-xl font-semibold leading-none tabular-nums xl:text-2xl">
          {item.quantity}
          {KDS_HEATMAP_LABELS.quantitySuffix}
        </span>
      </div>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-1 gap-y-1 xl:min-h-9 xl:gap-x-1.5">
        <span className="min-w-0 break-words text-base font-semibold leading-5 xl:text-lg xl:leading-6">
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
      <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-end gap-1 xl:col-auto xl:shrink-0 xl:flex-nowrap">
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
            className="w-12 px-0"
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
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void onCompleteTickets([ticket.id])}
            aria-label={KDS_HEATMAP_LABELS.completeNamedItem(item.item_name)}
          >
            {isMutating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" aria-hidden />
            )}
          </Button>
        )}
      </div>
    </Item>
  );
}

function CompactOrphanRow({
  ticket,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onCompleteTickets,
  onRecall,
}: {
  ticket: KdsTicket;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}) {
  const isMutating = pendingTicketIds.has(ticket.id);
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
        "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-1.5 border-t border-border/40 py-1.5 transition-colors duration-150 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-2 xl:py-2 p-0 rounded-none border-x-0 border-b-0",
        getItemRowStatusClass(ticket.status),
        getKdsRowEffectClass(rowEffect),
      )}
    >
      <span className="min-w-0 break-words text-base font-semibold leading-6 text-muted-foreground">
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
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void onCompleteTickets([ticket.id])}
            aria-label={KDS_HEATMAP_LABELS.completeItem}
          >
            {isMutating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" aria-hidden />
            )}
          </Button>
        )}
      </div>
    </Item>
  );
}

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
  const elapsed = useMemo(
    () => getOrderElapsedMinutes(order, now),
    [now, order],
  );
  const status = getKdsOrderDisplayStatus({ tickets: order.tickets });
  const ageStyle = getAgeStyle(elapsed, status === "ready");
  const contextLabel = getKdsOrderLabelOverride(order);
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
      order.tickets.filter((ticket) =>
        isKdsActiveTicketStatus(ticket.status),
      ),
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
        "min-w-0 shrink-0 gap-0 overflow-hidden border-l-2 p-2 transition-colors duration-150 xl:p-3",
        ageStyle.bg,
        getCardLeftAccent(status, elapsed),
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5 xl:flex-row xl:items-start xl:justify-between xl:gap-2">
        <div className="min-w-0 xl:flex-1">
          <OrderTitleLine
            kitchenTicketNumber={order.kitchenTicketNumber}
            orderNumber={order.orderNumber}
            orderType={order.orderType}
            tableNumber={order.tableNumber}
            contextLabel={contextLabel}
            size="compact"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {order.isPriority && (
              <Badge
                variant="warning"
                className="px-2 py-0.5 text-xs xl:px-2.5 xl:py-1 xl:text-sm"
              >
                {KDS_HEATMAP_LABELS.priority}
              </Badge>
            )}
          </div>
          <OrderNote
            note={order.orderNote}
            compact
            className="mt-1.5 max-w-full xl:mt-2"
          />
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-1 xl:w-auto xl:shrink-0 xl:justify-end">
          {canMarkReady && (
            <BatchActions
              layout="title"
              orderGroupKey={order.groupKey}
              activeTickets={activeTickets}
              pendingTicketIds={pendingTicketIds}
              onCompleteTickets={onCompleteTickets}
            />
          )}
          {showOrderStatusBadge && (
            <StatusBadge
              domain="order"
              value={status}
              className="px-2 py-0.5 text-xs xl:px-2.5 xl:py-1 xl:text-sm"
            />
          )}
          <AgeBadge
            elapsedMinutes={elapsed}
            isComplete={status === "ready"}
            size="compact"
          />
        </div>
      </div>
      <div className="mt-2 min-w-0 rounded-md bg-card/70 p-2 xl:mt-3 xl:p-3">
        {order.items.map((item) => (
          <CompactItemRow
            key={item.id}
            item={item}
            ticket={ticketByItemId.get(item.id)}
            pendingTicketIds={pendingTicketIds}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
            onCompleteTickets={onCompleteTickets}
            onRecall={onRecall}
          />
        ))}
        {orphanTickets.map((ticket) => (
          <CompactOrphanRow
            key={ticket.id}
            ticket={ticket}
            pendingTicketIds={pendingTicketIds}
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
      className={cn(
        "flex min-h-0 min-w-0 flex-col xl:h-full",
        column.widthClass,
      )}
      aria-label={column.title}
    >
      <div
        data-testid={`kds-column-list-${column.id}`}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto xl:gap-2"
      >
        {column.orders.length === 0 ? (
          <AppEmptyState
            data-testid={`kds-column-empty-${column.id}`}
            compact
            className="border-dashed bg-muted/20 px-3 py-3"
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
  hasGroupedOrders,
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
        <div
          data-testid="kds-order-columns"
          className="grid min-h-full gap-1.5 p-1.5 md:grid-cols-3 xl:h-full xl:min-h-0 xl:grid-cols-10 xl:gap-2 xl:overflow-hidden xl:p-2"
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
