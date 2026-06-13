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
  getKdsRowEffectClass,
  useKdsRowEffect,
} from "../hooks/use-kds-row-effects";
import {
  getKdsOrderLabelOverride,
  groupKdsOrdersByColumn,
} from "../lib/order-columns";
import {
  getKdsOrderDisplayStatus,
  isKdsActiveTicketStatus,
} from "../lib/order-status";
import {
  getStatusLabel,
  getStatusVariant,
  shouldShowTicketStatusBadge,
} from "../lib/status-config";
import { BatchActions } from "./batch-actions";
import { OrderNote } from "./order-note";
import { OrderTitleLine } from "./order-title-line";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsOrderItem, KdsTicket } from "../types";
import type { KdsOrderColumn } from "../lib/order-columns";

const KDS_HEATMAP_LABELS = {
  completeItem: "Hoàn tất món",
  completeNamedItem: (itemName: string) => `Hoàn tất ${itemName}`,
  outOfStock: "Báo hết món",
  outOfStockNamedItem: (itemName: string) => `Báo hết món ${itemName}`,
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
  onOutOfStock: (ticketId: number) => Promise<void>;
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
  const canCompleteByStatus = !isCancelled && isKdsActiveTicketStatus(status);
  const canRecallByStatus = !isCancelled && status === "ready";
  const canComplete = canCompleteByStatus && canMarkReady && ticket != null;
  const canOutOfStock = canCompleteByStatus && canMarkReady && ticket != null;
  const allowRecall = canRecallByStatus && canRecall && ticket != null;
  const rowEffect = useKdsRowEffect(ticket?.id);

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
      data-kds-effect={rowEffect ?? undefined}
      className={cn(
        "grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-1.5 gap-y-1 border-t border-border/40 py-1.5 transition-colors duration-300 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[3.5rem_minmax(0,1fr)_auto] xl:items-center xl:gap-2 xl:py-2",
        getItemRowStatusClass(status),
        getKdsRowEffectClass(rowEffect),
      )}
    >
      <div
        className={cn(
          "flex h-8 w-12 shrink-0 items-center justify-center rounded-md px-1.5 ring-1 ring-inset xl:h-9 xl:w-14 xl:px-2",
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
            className="h-5 rounded-md px-1.5 py-0 text-xs font-semibold leading-none xl:h-6 xl:px-2 xl:text-sm"
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
          <Badge
            variant={getStatusVariant(status)}
            className="h-5 rounded-md px-2 py-0 text-xs font-semibold leading-none xl:h-6 xl:px-2.5 xl:text-sm"
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
            aria-label={KDS_HEATMAP_LABELS.outOfStockNamedItem(item.item_name)}
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
            aria-label={KDS_HEATMAP_LABELS.recallNamedItem(item.item_name)}
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
            aria-label={KDS_HEATMAP_LABELS.completeNamedItem(item.item_name)}
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
    !isCancelled && isKdsActiveTicketStatus(ticket.status);
  const canRecallByStatus = !isCancelled && ticket.status === "ready";
  const canComplete = canCompleteByStatus && canMarkReady;
  const canOutOfStock = canCompleteByStatus && canMarkReady;
  const allowRecall = canRecallByStatus && canRecall;
  const rowEffect = useKdsRowEffect(ticket.id);

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
      data-kds-effect={rowEffect ?? undefined}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-1.5 border-t border-border/40 py-1.5 transition-colors duration-300 first:border-t-0 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-2 xl:py-2",
        getItemRowStatusClass(ticket.status),
        getKdsRowEffectClass(rowEffect),
      )}
    >
      <span className="min-w-0 break-words text-base font-semibold leading-6 text-muted-foreground">
        {PRODUCT_VI.posItem} #{String(ticket.order_item_id)}
      </span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 xl:shrink-0 xl:flex-nowrap">
        {shouldShowTicketStatusBadge(ticket.status) && (
          <Badge
            variant={getStatusVariant(ticket.status)}
            className="h-5 rounded-md px-2 py-0 text-xs font-semibold leading-none xl:h-6 xl:px-2.5 xl:text-sm"
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
            aria-label={KDS_HEATMAP_LABELS.outOfStock}
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
            aria-label={KDS_HEATMAP_LABELS.recallItem}
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
            aria-label={KDS_HEATMAP_LABELS.completeItem}
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
  canRecall,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
  isCurrent,
}: {
  order: KdsOrder;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
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
    <Card
      data-testid={`kds-heatmap-card-${order.groupKey}`}
      data-kds-current={isCurrent ? "true" : undefined}
      className={cn(
        "min-w-0 gap-0 overflow-hidden border-l-2 p-2 xl:p-3",
        ageStyle.bg,
        isCurrent &&
          "relative z-10 border-warning bg-warning/25 shadow-xl ring-2 ring-warning/70",
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
            <Badge
              variant={getStatusVariant(status)}
              className="px-2 py-0.5 text-xs xl:px-2.5 xl:py-1 xl:text-sm"
            >
              {getStatusLabel(status)}
            </Badge>
          )}
          <Badge
            variant={getStatusVariant(status)}
            className="shrink-0 px-2 py-0.5 text-xs font-semibold xl:px-2.5 xl:py-1 xl:text-sm"
          >
            {elapsed}p
          </Badge>
        </div>
      </div>
      <div className="mt-2 min-w-0 rounded-md border border-border/50 bg-card/70 p-1.5 xl:mt-3 xl:p-2">
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
  currentGroupKey,
}: {
  column: KdsOrderColumn;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  currentGroupKey: string | null;
}) {
  // Peak relief: a long lane packs two cards per row on xl so the cook can
  // scan 8-10 orders without scrolling. The narrow add-on lane (col-span-2)
  // cannot fit two readable cards, so it always stays a single column.
  const dense = column.orders.length > 5 && column.id !== "add_on";

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
        className={cn(
          "min-h-0 flex-1 space-y-1.5 overflow-y-auto xl:space-y-2",
          dense &&
            "xl:grid xl:grid-cols-2 xl:content-start xl:gap-2 xl:space-y-0",
        )}
      >
        {column.orders.length === 0 ? (
          <div
            data-testid={`kds-column-empty-${column.id}`}
            className="flex items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-3 text-center text-base font-medium text-muted-foreground"
          >
            {column.emptyTitle}
          </div>
        ) : (
          column.orders.map((order) => (
            <HeatmapCard
              key={order.groupKey}
              order={order}
              pendingTicketIds={pendingTicketIds}
              canMarkReady={canMarkReady}
              canRecall={canRecall}
              onRecall={onRecall}
              onOutOfStock={onOutOfStock}
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
  onOutOfStock,
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
              onOutOfStock={onOutOfStock}
              onCompleteTickets={onCompleteTickets}
              currentGroupKey={currentGroupKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
