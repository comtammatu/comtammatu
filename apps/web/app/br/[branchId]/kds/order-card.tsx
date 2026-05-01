"use client";

import { useMemo } from "react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { useBoardTick } from "./hooks/use-board-tick";
import {
  getAgeStyle,
  getCardBorder,
  getCardLeftAccent,
} from "./lib/age-style";
import { OrderCardHeader } from "./components/order-card-header";
import { TicketRow } from "./components/ticket-row";
import { BatchActions } from "./components/batch-actions";
import type { KdsOrder, KdsTicket } from "./types";

function getKitchenCompleteAtMs(tickets: KdsTicket[]): number | null {
  if (tickets.length === 0) return null;
  if (!tickets.every((t) => t.status === "ready")) return null;
  const times = tickets.map((t) => {
    const raw = t.bumped_at ?? t.created_at;
    return new Date(raw).getTime();
  });
  return Math.max(...times);
}

interface OrderCardProps {
  order: KdsOrder;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  className?: string;
}

export function OrderCard({
  order,
  onBump,
  onRecall,
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
    if (statuses.every((s) => s === "ready")) return "ready";
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
        "gap-0 py-0 border-l-2 transition-shadow hover:shadow-md",
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
        sendSeq={order.sendSeq}
        sendKind={order.sendKind}
        elapsedMinutes={elapsed}
        isComplete={isComplete}
        bgClass={ageStyle.bg}
      />

      <CardContent className="flex-1 divide-y divide-border/30 p-0">
        {order.items.map((item) => (
          <TicketRow
            key={item.id}
            kind="item"
            item={item}
            ticket={ticketByItemId.get(item.id)}
            onBump={onBump}
            onRecall={onRecall}
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
            onBump={onBump}
            onRecall={onRecall}
            isMutating={pendingTicketIds.has(ticket.id)}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
          />
        ))}
      </CardContent>

      {canMarkReady && (
        <BatchActions
          pendingTickets={pendingTickets}
          preparingTickets={preparingTickets}
          pendingTicketIds={pendingTicketIds}
          onBump={onBump}
        />
      )}
    </Card>
  );
}
