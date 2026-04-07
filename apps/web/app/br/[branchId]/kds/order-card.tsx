"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card } from "@comtammatu/ui/components/card";
import { ChevronRight, Undo2 } from "lucide-react";
import type { KdsOrder } from "./kds-board";

/* ─── Status helpers ─── */

const STATUS_CONFIG = {
  pending: {
    label: "Chờ",
    className: "bg-gray-600 text-gray-100",
  },
  preparing: {
    label: "Đang làm",
    className: "bg-yellow-600 text-yellow-100",
  },
  ready: {
    label: "Xong",
    className: "bg-green-600 text-green-100",
  },
} as const;

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
      label: status,
      className: "bg-gray-600 text-gray-100",
    }
  );
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Tại chỗ",
  takeaway: "Mang đi",
};

/* ─── Elapsed time hook ─── */

function useElapsedMinutes(createdAt: string): number {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(
        Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
      );
    }, 15000); // update every 15s
    return () => clearInterval(interval);
  }, [createdAt]);

  return elapsed;
}

function getElapsedColor(minutes: number): string {
  if (minutes < 5) return "text-green-400";
  if (minutes < 10) return "text-yellow-400";
  return "text-red-400";
}

/* ─── Component ─── */

interface OrderCardProps {
  order: KdsOrder;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}

export function OrderCard({ order, onBump, onRecall }: OrderCardProps) {
  const elapsed = useElapsedMinutes(order.createdAt);

  // Build a map from order_item_id to ticket
  const ticketByItemId = useMemo(() => {
    const map = new Map<number, (typeof order.tickets)[number]>();
    for (const t of order.tickets) {
      map.set(t.order_item_id, t);
    }
    return map;
  }, [order.tickets]);

  // Determine overall order status for card border
  const overallStatus = useMemo(() => {
    const statuses = order.tickets.map((t) => t.status);
    if (statuses.every((s) => s === "ready")) return "ready";
    if (statuses.some((s) => s === "preparing")) return "preparing";
    return "pending";
  }, [order.tickets]);

  const borderColor =
    overallStatus === "ready"
      ? "border-green-600/50"
      : overallStatus === "preparing"
        ? "border-yellow-600/50"
        : "border-border";

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden border-2 bg-card",
        borderColor,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold">{order.orderNumber}</span>
          <Badge variant="outline" className="text-[10px]">
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </Badge>
          {order.tableNumber !== null && (
            <Badge variant="secondary" className="text-[10px]">
              Bàn {order.tableNumber}
            </Badge>
          )}
        </div>
        <span className={cn("text-sm font-semibold", getElapsedColor(elapsed))}>
          {elapsed}p
        </span>
      </div>

      {/* Items list */}
      <div className="flex-1 divide-y divide-border/30">
        {order.items.map((item) => {
          const ticket = ticketByItemId.get(item.id);
          const status = ticket?.status ?? "pending";
          const config = getStatusConfig(status);
          const canBump = status === "pending" || status === "preparing";
          const canRecall = status === "preparing" || status === "ready";

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2",
                status === "ready" && "opacity-50",
              )}
            >
              {/* Item info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-medium">{item.quantity}x</span>
                  <span className="truncate text-sm">{item.item_name}</span>
                </div>
                {item.variant_name && (
                  <span className="text-xs text-muted-foreground">
                    {item.variant_name}
                  </span>
                )}
                {/* Sides (accompaniments like Bì, Chả, etc.) */}
                {item.sides?.map((side) => (
                  <div
                    key={side.side_item_id}
                    className="text-xs text-muted-foreground"
                  >
                    + {side.name}
                  </div>
                ))}
                {/* Modifiers (add-ons like Extra cheese, etc.) */}
                {item.modifiers?.map((mod) => (
                  <div
                    key={mod.modifier_id}
                    className="text-xs text-muted-foreground"
                  >
                    + {mod.name}
                  </div>
                ))}
              </div>

              {/* Status badge */}
              <Badge className={cn("shrink-0 text-[10px]", config.className)}>
                {config.label}
              </Badge>

              {/* Action buttons */}
              <div className="flex shrink-0 gap-1">
                {ticket && canRecall && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
                    onClick={() => void onRecall(ticket.id)}
                  >
                    <Undo2 className="size-4" />
                    <span className="sr-only">Thu hồi</span>
                  </Button>
                )}
                {ticket && canBump && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-9 min-h-11 min-w-11"
                    onClick={() => void onBump(ticket.id)}
                  >
                    <ChevronRight className="size-5" />
                    <span className="sr-only">Bump</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Show tickets that don't have a matching order_item (edge case) */}
        {order.tickets
          .filter((t) => !order.items.some((i) => i.id === t.order_item_id))
          .map((ticket) => {
            const config = getStatusConfig(ticket.status);
            const canBump =
              ticket.status === "pending" || ticket.status === "preparing";
            const canRecall =
              ticket.status === "preparing" || ticket.status === "ready";

            return (
              <div
                key={ticket.id}
                className="flex items-center gap-2 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-muted-foreground">
                    Món #{String(ticket.order_item_id)}
                  </span>
                </div>
                <Badge className={cn("shrink-0 text-[10px]", config.className)}>
                  {config.label}
                </Badge>
                <div className="flex shrink-0 gap-1">
                  {canRecall && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
                      onClick={() => void onRecall(ticket.id)}
                    >
                      <Undo2 className="size-4" />
                      <span className="sr-only">Thu hồi</span>
                    </Button>
                  )}
                  {canBump && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-9 min-h-11 min-w-11"
                      onClick={() => void onBump(ticket.id)}
                    >
                      <ChevronRight className="size-5" />
                      <span className="sr-only">Bump</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Bump All button — when not all items are ready */}
      {order.tickets.some(
        (t) => t.status === "pending" || t.status === "preparing",
      ) && (
        <div className="border-t border-border/50 p-2">
          <Button
            variant="default"
            size="sm"
            className="min-h-11 w-full text-sm"
            onClick={() => {
              const bumpable = order.tickets.filter(
                (t) => t.status === "pending" || t.status === "preparing",
              );
              void Promise.all(bumpable.map((t) => onBump(t.id)));
            }}
          >
            Bump tất cả
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
