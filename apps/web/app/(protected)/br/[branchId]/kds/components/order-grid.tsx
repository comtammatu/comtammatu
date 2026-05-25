"use client";

import { useMemo } from "react";
import { PRODUCT_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { AppEmptyState } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Card } from "@comtammatu/ui/components/card";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Ban as IconBan,
  Check as IconCheck,
  ChefHat as IconChefHat,
  RotateCcw as IconRotate,
} from "lucide-react";
import { useBoardTick } from "../hooks/use-board-tick";
import { getAgeStyle, getCardLeftAccent } from "../lib/age-style";
import {
  getItemRowStatusClass,
  getQuantityStatusClass,
} from "../lib/item-status-style";
import {
  groupKdsOrdersByColumn,
  type KdsOrderColumnId,
} from "../lib/order-columns";
import {
  getStatusLabel,
  getStatusVariant,
  shouldShowTicketStatusBadge,
} from "../lib/status-config";
import { BatchActions } from "./batch-actions";
import { OrderTitleLine } from "./order-title-line";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsOrderItem, KdsTicket } from "../types";
import type { KdsOrderColumn } from "../lib/order-columns";

const KDS_HEATMAP_LABELS = {
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
  canRecall,
  onCompleteTickets,
  onRecall,
  onOutOfStock,
}: {
  item: KdsOrderItem;
  ticket: KdsTicket | undefined;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
}) {
  const status = ticket?.status ?? item.status;
  const isMutating = ticket ? pendingTicketIds.has(ticket.id) : false;
  const isCancelled = status === "cancelled";
  const canCompleteByStatus =
    !isCancelled && (status === "pending" || status === "preparing");
  const canRecallByStatus =
    !isCancelled && (status === "preparing" || status === "ready");
  const canComplete = canCompleteByStatus && canMarkReady && ticket != null;
  const canOutOfStock = canCompleteByStatus && canMarkReady && ticket != null;
  const allowRecall = canRecallByStatus && canRecall && ticket != null;

  async function handleOutOfStock() {
    if (!ticket) return;
    const ok = await confirm({
      title: "Báo hết món?",
      description: `${item.item_name} sẽ được hủy khỏi đơn và POS sẽ thấy thông báo để đổi món cho khách.`,
      confirmText: "Báo hết món",
      cancelText: "Giữ lại",
      variant: "destructive",
    });
    if (ok) {
      await onOutOfStock(ticket.id);
    }
  }

  return (
    <div
      data-testid={`kds-heatmap-item-${String(item.id)}`}
      className={cn(
        "grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-border/40 py-1 first:border-t-0 first:pt-0 last:pb-0",
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
        {ticket && canOutOfStock && (
          <Button
            data-testid={`kds-out-of-stock-${String(ticket.id)}`}
            type="button"
            variant="destructive"
            size="touch"
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void handleOutOfStock()}
            aria-label={`Báo hết món ${item.item_name}`}
          >
            {isMutating ? <Spinner /> : <IconBan aria-hidden />}
          </Button>
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
            aria-label={`Thu hồi ${item.item_name}`}
          >
            {isMutating ? <Spinner /> : <IconRotate aria-hidden />}
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
  canRecall,
  onCompleteTickets,
  onRecall,
  onOutOfStock,
}: {
  ticket: KdsTicket;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
}) {
  const isMutating = pendingTicketIds.has(ticket.id);
  const isCancelled = ticket.status === "cancelled";
  const canCompleteByStatus =
    !isCancelled &&
    (ticket.status === "pending" || ticket.status === "preparing");
  const canRecallByStatus =
    !isCancelled &&
    (ticket.status === "preparing" || ticket.status === "ready");
  const canComplete = canCompleteByStatus && canMarkReady;
  const canOutOfStock = canCompleteByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;

  async function handleOutOfStock() {
    const ok = await confirm({
      title: "Báo hết món?",
      description: `Món #${String(ticket.order_item_id)} sẽ được hủy khỏi đơn và POS sẽ thấy thông báo để đổi món cho khách.`,
      confirmText: "Báo hết món",
      cancelText: "Giữ lại",
      variant: "destructive",
    });
    if (ok) {
      await onOutOfStock(ticket.id);
    }
  }

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border/40 py-1 first:border-t-0 first:pt-0 last:pb-0",
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
        {canOutOfStock && (
          <Button
            data-testid={`kds-out-of-stock-${String(ticket.id)}`}
            type="button"
            variant="destructive"
            size="touch"
            className="w-12 px-0"
            disabled={isMutating}
            onClick={() => void handleOutOfStock()}
            aria-label="Báo hết món"
          >
            {isMutating ? <Spinner /> : <IconBan aria-hidden />}
          </Button>
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
            aria-label="Thu hồi món"
          >
            {isMutating ? <Spinner /> : <IconRotate aria-hidden />}
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
  columnId,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
}: {
  order: KdsOrder;
  columnId: KdsOrderColumnId;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}) {
  const now = useBoardTick();
  const elapsed = useMemo(
    () => getOrderElapsedMinutes(order, now),
    [now, order],
  );
  const status = getOverallStatus(order);
  const ageStyle = getAgeStyle(elapsed, status === "ready");
  const labelOverride = columnId === "append" ? "Gọi thêm" : undefined;
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
  const pendingTickets = useMemo(
    () => order.tickets.filter((ticket) => ticket.status === "pending"),
    [order.tickets],
  );
  const preparingTickets = useMemo(
    () => order.tickets.filter((ticket) => ticket.status === "preparing"),
    [order.tickets],
  );

  return (
    <Card
      data-testid={`kds-heatmap-card-${order.groupKey}`}
      className={cn(
        "min-w-0 gap-0 overflow-hidden border-l-2 p-2",
        ageStyle.bg,
        getCardLeftAccent(status, elapsed),
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <OrderTitleLine
            kitchenTicketNumber={order.kitchenTicketNumber}
            orderNumber={order.orderNumber}
            orderType={order.orderType}
            tableNumber={order.tableNumber}
            labelOverride={labelOverride}
            size="compact"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {order.isPriority && (
              <Badge variant="warning" className="px-2 py-0.5 text-xs">
                {KDS_HEATMAP_LABELS.priority}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {canMarkReady && (
            <BatchActions
              layout="title"
              orderGroupKey={order.groupKey}
              pendingTickets={pendingTickets}
              preparingTickets={preparingTickets}
              pendingTicketIds={pendingTicketIds}
              onCompleteTickets={onCompleteTickets}
            />
          )}
          {shouldShowTicketStatusBadge(status) && (
            <Badge
              variant={getStatusVariant(status)}
              className="px-2 py-0.5 text-xs"
            >
              {getStatusLabel(status)}
            </Badge>
          )}
          <Badge
            variant={getStatusVariant(status)}
            className="shrink-0 px-2 py-1 text-xs font-semibold"
          >
            {elapsed}p
          </Badge>
        </div>
      </div>
      <div className="mt-2 min-w-0 rounded-md border border-border/50 bg-card/70 p-1.5">
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
            onOutOfStock={onOutOfStock}
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
            onOutOfStock={onOutOfStock}
          />
        ))}
      </div>
    </Card>
  );
}

function OrderColumn({
  column,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
}: {
  column: KdsOrderColumn;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}) {
  return (
    <section
      data-testid={`kds-column-${column.id}`}
      className={cn(
        "flex min-h-64 min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card/40 md:min-h-0 lg:h-full",
        column.widthClass,
      )}
      aria-label={column.title}
    >
      <div
        data-testid={`kds-column-list-${column.id}`}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5"
      >
        {column.orders.length === 0 ? (
          <div
            data-testid={`kds-column-empty-${column.id}`}
            className="flex min-h-20 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 px-2 py-3 text-center text-sm font-medium text-muted-foreground"
          >
            {column.emptyTitle}
          </div>
        ) : (
          column.orders.map((order) => (
            <HeatmapCard
              key={order.groupKey}
              order={order}
              columnId={column.id}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              onRecall={onRecall}
              onOutOfStock={onOutOfStock}
              onCompleteTickets={onCompleteTickets}
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
  onOutOfStock,
  onCompleteTickets,
}: OrderGridProps) {
  const columns = useMemo(
    () => groupKdsOrdersByColumn(displayOrders),
    [displayOrders],
  );

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
        <div
          data-testid="kds-order-columns"
          className="grid min-h-full gap-1.5 p-1.5 md:grid-cols-2 lg:h-full lg:min-h-0 lg:grid-cols-10 lg:overflow-hidden"
        >
          {columns.map((column) => (
            <OrderColumn
              key={column.id}
              column={column}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              onRecall={onRecall}
              onOutOfStock={onOutOfStock}
              onCompleteTickets={onCompleteTickets}
            />
          ))}
        </div>
      )}
    </div>
  );
}
