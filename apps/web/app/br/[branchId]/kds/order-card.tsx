"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card } from "@comtammatu/ui/components/card";
import { ChevronRight, RotateCcw, UtensilsCrossed } from "lucide-react";
import type { KdsOrder } from "./kds-board";
import type { KdsTicket } from "./page";

/* ─── Status config ─── */

const STATUS_CONFIG = {
  pending: {
    label: "Chờ",
    badgeClass: "bg-zinc-700 text-zinc-100 border-zinc-600",
  },
  preparing: {
    label: "Đang làm",
    badgeClass: "bg-amber-600 text-amber-50 border-amber-500",
  },
  ready: {
    label: "Xong",
    badgeClass: "bg-emerald-600 text-emerald-50 border-emerald-500",
  },
  cancelled: {
    label: "Đã hủy",
    badgeClass: "bg-red-800 text-red-100 border-red-700",
  },
} as const;

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
      label: status,
      badgeClass: "bg-zinc-700 text-zinc-100 border-zinc-600",
    }
  );
}

const ORDER_TYPE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  dine_in: {
    label: "Tại chỗ",
    className: "bg-blue-900/60 text-blue-200 border-blue-700/50",
  },
  takeaway: {
    label: "Mang đi",
    className: "bg-purple-900/60 text-purple-200 border-purple-700/50",
  },
};

function getOrderTypeConfig(type: string) {
  return (
    ORDER_TYPE_CONFIG[type] ?? {
      label: type,
      className: "bg-zinc-800 text-zinc-300 border-zinc-600",
    }
  );
}

/* ─── Age color coding: green → yellow → red ─── */

/**
 * Returns Tailwind classes for the elapsed time display.
 * < 5 min: green (fresh)
 * 5–9 min: yellow (aging)
 * ≥ 10 min: red (old — needs attention)
 */
function getAgeStyle(minutes: number, isComplete: boolean) {
  if (isComplete) return { text: "text-emerald-400", bg: "" };
  if (minutes < 5) return { text: "text-emerald-400", bg: "" };
  if (minutes < 10) return { text: "text-amber-400", bg: "bg-amber-950/40" };
  return { text: "text-red-400", bg: "bg-red-950/50" };
}

/* ─── Card border per overall status ─── */

function getCardBorder(
  overallStatus: string,
  ageMinutes: number,
): string {
  if (overallStatus === "cancelled") return "border-red-800/60";
  if (overallStatus === "ready") return "border-emerald-600/60";
  if (overallStatus === "preparing") return "border-amber-500/60";
  // pending — age-tinted border
  if (ageMinutes >= 10) return "border-red-600/70";
  if (ageMinutes >= 5) return "border-amber-700/60";
  return "border-zinc-600/50";
}

/* ─── Cancelled overlay ─── */

function CancelledTicketOverlay() {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setFaded(true), 30000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-destructive/20 motion-safe:transition-opacity motion-safe:duration-500",
        faded && "opacity-40",
      )}
      aria-hidden
    >
      <span className="rounded-md bg-destructive px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-destructive-foreground">
        Đã hủy
      </span>
    </div>
  );
}

/* ─── Elapsed time hook ─── */

function getKitchenCompleteAtMs(tickets: KdsTicket[]): number | null {
  if (tickets.length === 0) return null;
  if (!tickets.every((t) => t.status === "ready")) return null;
  const times = tickets.map((t) => {
    const raw = t.bumped_at ?? t.created_at;
    return new Date(raw).getTime();
  });
  return Math.max(...times);
}

function useKitchenElapsedMinutes(
  createdAt: string,
  tickets: KdsTicket[],
): number {
  const createdMs = new Date(createdAt).getTime();

  const completeAtMs = useMemo(
    () => getKitchenCompleteAtMs(tickets),
    [tickets],
  );

  const [liveMinutes, setLiveMinutes] = useState(() =>
    Math.floor((Date.now() - createdMs) / 60000),
  );

  useEffect(() => {
    if (completeAtMs !== null) return;

    setLiveMinutes(Math.floor((Date.now() - createdMs) / 60000));
    const interval = setInterval(() => {
      setLiveMinutes(Math.floor((Date.now() - createdMs) / 60000));
    }, 15000);
    return () => clearInterval(interval);
  }, [completeAtMs, createdMs]);

  if (completeAtMs !== null) {
    return Math.max(0, Math.floor((completeAtMs - createdMs) / 60000));
  }
  return liveMinutes;
}

/* ─── Component ─── */

interface OrderCardProps {
  order: KdsOrder;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}

export function OrderCard({ order, onBump, onRecall }: OrderCardProps) {
  const elapsed = useKitchenElapsedMinutes(order.createdAt, order.tickets);

  const ticketByItemId = useMemo(() => {
    const map = new Map<number, (typeof order.tickets)[number]>();
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
  const typeConfig = getOrderTypeConfig(order.orderType);

  const bumpableTickets = order.tickets.filter(
    (t) => t.status === "pending" || t.status === "preparing",
  );

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden border-2 bg-card",
        borderClass,
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-start justify-between gap-2 border-b border-border/40 px-4 py-3",
          ageStyle.bg,
        )}
      >
        {/* Left: order number + type + table */}
        <div className="flex min-w-0 flex-col gap-1">
          {/* Order number — must be readable from 2-3m */}
          <span className="text-2xl font-black leading-none tracking-tight tabular-nums">
            {order.orderNumber}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "border px-2 py-0.5 text-xs font-semibold",
                typeConfig.className,
              )}
            >
              {typeConfig.label}
            </Badge>
            {order.tableNumber !== null && (
              <Badge
                variant="secondary"
                className="bg-zinc-700/60 px-2 py-0.5 text-xs font-semibold text-zinc-200"
              >
                Bàn {order.tableNumber}
              </Badge>
            )}
          </div>
        </div>

        {/* Right: elapsed timer — color-coded age */}
        <div className="flex shrink-0 flex-col items-end">
          <span
            className={cn(
              "text-2xl font-black tabular-nums leading-none",
              ageStyle.text,
            )}
          >
            {elapsed}
          </span>
          <span className={cn("text-xs font-medium", ageStyle.text)}>phút</span>
        </div>
      </div>

      {/* ── Items list ── */}
      <div className="flex-1 divide-y divide-border/30">
        {order.items.map((item) => {
          const ticket = ticketByItemId.get(item.id);
          const status = ticket?.status ?? "pending";
          const config = getStatusConfig(status);
          const isCancelled = status === "cancelled";
          const canBump =
            !isCancelled && (status === "pending" || status === "preparing");
          const canRecall =
            !isCancelled && (status === "preparing" || status === "ready");

          return (
            <div
              key={item.id}
              className={cn(
                "relative flex items-center gap-3 px-4 py-3",
                status === "ready" && "opacity-50",
                isCancelled && "opacity-100",
              )}
            >
              {isCancelled && <CancelledTicketOverlay />}

              {/* Item info — large text for kitchen readability */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {/* Quantity — gold accent, very prominent */}
                  <span className="text-xl font-black leading-tight text-amber-400 tabular-nums">
                    {item.quantity}×
                  </span>
                  <span className="text-xl font-bold leading-tight">
                    {item.item_name}
                  </span>
                </div>
                {item.variant_name && (
                  <span className="mt-0.5 block text-sm font-medium text-muted-foreground">
                    {item.variant_name}
                  </span>
                )}
              </div>

              {/* Status badge — readable at distance */}
              <Badge
                className={cn(
                  "shrink-0 border px-2 py-1 text-xs font-bold",
                  config.badgeClass,
                )}
              >
                {config.label}
              </Badge>

              {/* Action buttons — 56px min touch target */}
              <div className="flex shrink-0 gap-1">
                {ticket && canRecall && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-14 min-h-14 min-w-14 rounded-xl text-muted-foreground hover:bg-zinc-700/60 hover:text-foreground"
                    onClick={() => void onRecall(ticket.id)}
                  >
                    <RotateCcw className="size-5" />
                    <span className="sr-only">Thu hồi</span>
                  </Button>
                )}
                {ticket && canBump && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className={cn(
                      "size-14 min-h-14 min-w-14 rounded-xl",
                      status === "preparing"
                        ? "bg-emerald-700 text-emerald-50 hover:bg-emerald-600"
                        : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600",
                    )}
                    onClick={() => void onBump(ticket.id)}
                  >
                    <ChevronRight className="size-6" />
                    <span className="sr-only">Bump</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Orphan tickets (no matching order_item — edge case) */}
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
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-base text-muted-foreground">
                    Món #{String(ticket.order_item_id)}
                  </span>
                </div>
                <Badge
                  className={cn(
                    "shrink-0 border px-2 py-1 text-xs font-bold",
                    config.badgeClass,
                  )}
                >
                  {config.label}
                </Badge>
                <div className="flex shrink-0 gap-1">
                  {canRecall && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-14 min-h-14 min-w-14 rounded-xl text-muted-foreground hover:bg-zinc-700/60 hover:text-foreground"
                      onClick={() => void onRecall(ticket.id)}
                    >
                      <RotateCcw className="size-5" />
                      <span className="sr-only">Thu hồi</span>
                    </Button>
                  )}
                  {canBump && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-14 min-h-14 min-w-14 rounded-xl bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                      onClick={() => void onBump(ticket.id)}
                    >
                      <ChevronRight className="size-6" />
                      <span className="sr-only">Bump</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* ── Bump All footer ── */}
      {bumpableTickets.length > 0 && (
        <div className="border-t border-border/50 p-3">
          <Button
            variant="default"
            className={cn(
              "min-h-14 w-full rounded-xl text-base font-bold",
              // Gold accent for "ready to serve" state (all preparing → ready)
              bumpableTickets.every((t) => t.status === "preparing")
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-amber-600 text-white hover:bg-amber-500",
            )}
            onClick={() => {
              void Promise.all(bumpableTickets.map((t) => onBump(t.id)));
            }}
          >
            <UtensilsCrossed className="mr-2 size-5" />
            {bumpableTickets.every((t) => t.status === "preparing")
              ? "Hoàn thành tất cả"
              : "Bắt đầu tất cả"}
            <ChevronRight className="ml-1 size-5" />
          </Button>
        </div>
      )}
    </Card>
  );
}
