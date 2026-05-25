"use client";

import { memo, useMemo } from "react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { useBoardTick } from "./hooks/use-board-tick";
import { getAgeStyle, getCardBorder, getCardLeftAccent } from "./lib/age-style";
import { getKdsOrderLabelOverride } from "./lib/order-columns";
import { OrderCardHeader } from "./components/order-card-header";
import { TicketRow } from "./components/ticket-row";
import { BatchActions } from "./components/batch-actions";
import type { KdsOrder, KdsTicket } from "./types";

function getKitchenCompleteAtMs(tickets: KdsTicket[]): number | null {
  if (tickets.length === 0) return null;
  if (!tickets.every((t) => t.status === "ready" || t.status === "cancelled")) {
    return null;
  }
  const times = tickets.map((t) => {
    const raw = t.bumped_at ?? t.created_at;
    return new Date(raw).getTime();
  });
  return Math.max(...times);
}

interface OrderCardProps {
  order: KdsOrder;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  className?: string;
}

function OrderCardComponent({
  order,
  onRecall,
  onOutOfStock,
  onCompleteTickets,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  className,
}: OrderCardProps) {
  const now = useBoardTick();

  const createdMs = useMemo(
    () => new Date(order.createdAt).getTime(),
    [order.createdAt],
  );

  const completeAtMs = useMemo(
    () => getKitchenCompleteAtMs(order.tickets),
    [order.tickets],
  );

  const elapsed = useMemo(() => {
    if (completeAtMs !== null) {
      return Math.max(0, Math.floor((completeAtMs - createdMs) / 60000));
    }
    return Math.max(0, Math.floor((now - createdMs) / 60000));
  }, [completeAtMs, createdMs, now]);

  const ticketByItemId = useMemo(() => {
    const map = new Map<number, KdsTicket>();
    for (const t of order.tickets) {
      map.set(t.order_item_id, t);
    }
    return map;
  }, [order.tickets]);

  const overallStatus = useMemo(() => {
    const statuses = order.tickets.map((t) => t.status);
    if (statuses.length > 0 && statuses.every((s) => s === "cancelled")) {
      return "cancelled";
    }
    if (statuses.every((s) => s === "ready" || s === "cancelled")) {
      return "ready";
    }
    if (statuses.some((s) => s === "preparing")) return "preparing";
    return "pending";
  }, [order.tickets]);

  const isComplete = overallStatus === "ready";
  const ageStyle = getAgeStyle(elapsed, isComplete);
  const borderClass = getCardBorder(overallStatus, elapsed);

  const pendingTickets = useMemo(
    () => order.tickets.filter((t) => t.status === "pending"),
    [order.tickets],
  );
  const preparingTickets = useMemo(
    () => order.tickets.filter((t) => t.status === "preparing"),
    [order.tickets],
  );

  const orphanTickets = useMemo(
    () =>
      order.tickets.filter(
        (t) => !order.items.some((i) => i.id === t.order_item_id),
      ),
    [order.items, order.tickets],
  );

  return (
    <Card
      data-testid={`kds-order-card-${order.groupKey}`}
      className={cn(
        "min-w-0 gap-0 overflow-hidden border-l-2 py-0 transition-shadow hover:shadow-md",
        borderClass,
        getCardLeftAccent(overallStatus, elapsed),
        className,
      )}
    >
      <OrderCardHeader
        orderNumber={order.orderNumber}
        kitchenTicketNumber={order.kitchenTicketNumber}
        orderType={order.orderType}
        tableNumber={order.tableNumber}
        sendKind={order.sendKind}
        contextLabel={getKdsOrderLabelOverride(order)}
        elapsedMinutes={elapsed}
        isComplete={isComplete}
        isPriority={order.isPriority}
        orderNote={order.orderNote}
        bgClass={ageStyle.bg}
      />

      <CardContent className="divide-y divide-border/30 p-0">
        {order.items.map((item) => (
          <TicketRow
            key={item.id}
            kind="item"
            item={item}
            ticket={ticketByItemId.get(item.id)}
            onRecall={onRecall}
            onOutOfStock={onOutOfStock}
            onCompleteTickets={onCompleteTickets}
            isMutating={
              ticketByItemId.get(item.id)
                ? pendingTicketIds.has(ticketByItemId.get(item.id)!.id)
                : false
            }
            canMarkReady={canMarkReady}
            canRecall={canRecall}
          />
        ))}

        {orphanTickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            kind="orphan"
            ticket={ticket}
            onRecall={onRecall}
            onOutOfStock={onOutOfStock}
            onCompleteTickets={onCompleteTickets}
            isMutating={pendingTicketIds.has(ticket.id)}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
          />
        ))}
      </CardContent>

      {canMarkReady && (
        <BatchActions
          orderGroupKey={order.groupKey}
          pendingTickets={pendingTickets}
          preparingTickets={preparingTickets}
          pendingTicketIds={pendingTicketIds}
          onCompleteTickets={onCompleteTickets}
        />
      )}
    </Card>
  );
}

// Tight propsAreEqual: at peak hour the board may render 30+ cards, every
// kds_tickets UPDATE causes setTickets in use-kds-realtime → groupedOrders
// recomputes a fresh array → without memo every card re-reconciles. We
// only re-render when this specific order's data actually moved or its
// tickets are in/out of the pendingTicketIds optimistic set.
function arePropsEqual(prev: OrderCardProps, next: OrderCardProps): boolean {
  if (prev.canMarkReady !== next.canMarkReady) return false;
  if (prev.canRecall !== next.canRecall) return false;
  if (prev.className !== next.className) return false;
  if (prev.onRecall !== next.onRecall) return false;
  if (prev.onOutOfStock !== next.onOutOfStock) return false;
  if (prev.onCompleteTickets !== next.onCompleteTickets) return false;

  const a = prev.order;
  const b = next.order;
  if (a === b) {
    return arePendingSetsEqualForOrder(
      prev.pendingTicketIds,
      next.pendingTicketIds,
      a.tickets,
    );
  }

  if (
    a.groupKey !== b.groupKey ||
    a.orderNumber !== b.orderNumber ||
    a.tableNumber !== b.tableNumber ||
    a.kitchenTicketNumber !== b.kitchenTicketNumber ||
    a.orderNote !== b.orderNote ||
    a.sendSeq !== b.sendSeq ||
    a.sendKind !== b.sendKind ||
    a.isPriority !== b.isPriority ||
    a.orderType !== b.orderType ||
    a.createdAt !== b.createdAt
  ) {
    return false;
  }

  if (a.tickets.length !== b.tickets.length) return false;
  for (let i = 0; i < a.tickets.length; i++) {
    const ta = a.tickets[i]!;
    const tb = b.tickets[i]!;
    if (
      ta.id !== tb.id ||
      ta.status !== tb.status ||
      ta.bumped_at !== tb.bumped_at ||
      ta.kitchen_send_batch_id !== tb.kitchen_send_batch_id ||
      ta.updated_at !== tb.updated_at
    ) {
      return false;
    }
  }

  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i++) {
    const ia = a.items[i]!;
    const ib = b.items[i]!;
    if (
      ia.id !== ib.id ||
      ia.menu_item_id !== ib.menu_item_id ||
      ia.status !== ib.status ||
      ia.is_priority !== ib.is_priority ||
      ia.quantity !== ib.quantity ||
      ia.item_name !== ib.item_name ||
      ia.variant_name !== ib.variant_name ||
      ia.unit_price !== ib.unit_price ||
      ia.note !== ib.note ||
      JSON.stringify(ia.modifiers ?? null) !==
        JSON.stringify(ib.modifiers ?? null) ||
      JSON.stringify(ia.sides ?? null) !== JSON.stringify(ib.sides ?? null)
    ) {
      return false;
    }
  }

  return arePendingSetsEqualForOrder(
    prev.pendingTicketIds,
    next.pendingTicketIds,
    a.tickets,
  );
}

function arePendingSetsEqualForOrder(
  prev: Set<number>,
  next: Set<number>,
  tickets: KdsTicket[],
): boolean {
  // The Set identity changes whenever ANY ticket optimistic-mutates board-
  // wide, but only THIS order's tickets matter for this card.
  for (const t of tickets) {
    if (prev.has(t.id) !== next.has(t.id)) return false;
  }
  return true;
}

export const OrderCard = memo(OrderCardComponent, arePropsEqual);
