"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card } from "@comtammatu/ui/components/card";
import { Check, ChevronRight, RotateCcw, UtensilsCrossed } from "lucide-react";
import type { KdsOrder } from "./kds-board";
import type { KdsTicket } from "./page";

/* ─── Status config ─── */

const STATUS_CONFIG = {
  pending: {
    label: "Chờ",
    variant: "warning" as const,
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  preparing: {
    label: "Đang làm",
    variant: "warning" as const,
    badgeClass: "bg-warning/20 text-warning border-warning/30",
  },
  ready: {
    label: "Xong",
    variant: "success" as const,
    badgeClass: "bg-success/20 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    variant: "destructive" as const,
    badgeClass: "bg-destructive/20 text-destructive border-destructive/30",
  },
} as const;

type KdsStatusConfig = (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG];

function getStatusConfig(status: string) {
  return (STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
    variant: "warning" as const,
    label: status,
    badgeClass: "bg-muted text-muted-foreground border-border",
  }) as KdsStatusConfig;
}

const ORDER_TYPE_CONFIG: Record<string, { label: string; className: string }> =
  {
    dine_in: {
      label: "Tại bàn",
      className: "bg-info/20 text-info border-info/30",
    },
    takeaway: {
      label: "Mang về",
      className: "bg-accent/20 text-accent-foreground border-accent/40",
    },
  };

function getOrderTypeConfig(type: string) {
  return (
    ORDER_TYPE_CONFIG[type] ?? {
      label: type,
      className: "bg-muted text-muted-foreground border-border",
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
  if (isComplete) return { text: "text-success", bg: "" };
  if (minutes < 5) return { text: "text-success", bg: "" };
  if (minutes < 10) return { text: "text-warning", bg: "bg-warning/10" };
  return { text: "text-destructive", bg: "bg-destructive/10" };
}

/* ─── Card border per overall status ─── */

function getCardBorder(overallStatus: string, ageMinutes: number): string {
  if (overallStatus === "cancelled") return "border-destructive/60";
  if (overallStatus === "ready") return "border-success/60";
  if (overallStatus === "preparing") return "border-warning/60";
  // pending — age-tinted border
  if (ageMinutes >= 10) return "border-destructive/70";
  if (ageMinutes >= 5) return "border-warning/70";
  return "border-border";
}

/* ─── Card left-border accent — vivid color stripe ─── */

function getCardLeftAccent(overallStatus: string, ageMinutes: number): string {
  if (overallStatus === "cancelled") return "border-l-destructive";
  if (overallStatus === "ready") return "border-l-success";
  if (overallStatus === "preparing") return "border-l-warning";
  if (ageMinutes >= 10) return "border-l-destructive";
  if (ageMinutes >= 5) return "border-l-warning";
  return "border-l-muted-foreground";
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
  const pendingCount = order.tickets.filter(
    (ticket) => ticket.status === "pending",
  ).length;
  const preparingCount = order.tickets.filter(
    (ticket) => ticket.status === "preparing",
  ).length;
  const readyCount = order.tickets.filter(
    (ticket) => ticket.status === "ready",
  ).length;
  const totalTickets = order.tickets.length;

  const bumpableTickets = order.tickets.filter(
    (t) => t.status === "pending" || t.status === "preparing",
  );

  return (
    <Card
      data-testid={`kds-order-card-${order.orderId}`}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col overflow-hidden border border-l-2 transition-all hover:-translate-y-0.5 hover:shadow-md",
        borderClass,
        getCardLeftAccent(overallStatus, elapsed),
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-start justify-between gap-2 border-b border-border/40 px-3 py-3 md:px-4",
          ageStyle.bg,
        )}
      >
        {/* Left: order number + type + table */}
        <div className="flex min-w-0 flex-col gap-1">
          {/* Order number — must be readable from 2-3m */}
          <span className="text-xl font-black leading-none tracking-tight tabular-nums md:text-2xl">
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
                className="bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground"
              >
                Bàn {order.tableNumber}
              </Badge>
            )}
          </div>
        </div>

        {/* Right: elapsed timer — pill badge */}
        <Badge
          variant="outline"
          className={cn(
            "flex shrink-0 flex-col items-center gap-0 rounded-lg border px-3 py-2",
            isComplete
              ? "border-success/40 bg-success/15 text-success"
              : elapsed >= 10
                ? "border-destructive/40 bg-destructive/15 text-destructive animate-pulse"
                : elapsed >= 5
                  ? "border-warning/40 bg-warning/15 text-warning"
                  : "border-border/50 bg-background/80 text-muted-foreground",
          )}
        >
          <span className="text-2xl font-black leading-none tabular-nums">
            {elapsed}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider opacity-70">
            phút
          </span>
        </Badge>
      </div>

      <div className="border-b border-border/30 px-3 py-3 md:px-4">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/30 text-card-foreground px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Chờ
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {pendingCount}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 text-card-foreground border-warning/20 bg-warning/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                Đang làm
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-warning">
                {preparingCount}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 text-card-foreground border-success/20 bg-success/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-success">
                Sẵn sàng
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-success">
                {readyCount}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-muted px-3 py-1.5">
              {readyCount}/{totalTickets} món đã xong
            </span>
            <span className="rounded-full border border-border/70 bg-muted px-3 py-1.5">
              {pendingCount > 0
                ? `${pendingCount} món cần nhận`
                : "Không còn món chờ"}
            </span>
          </div>
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
              data-testid={`kds-order-item-${item.id}`}
              className={cn(
                "relative flex items-center gap-2 px-3 py-3 md:gap-3 md:px-4",
                status === "ready" && "opacity-50",
                isCancelled && "opacity-100",
              )}
            >
              {isCancelled && <CancelledTicketOverlay />}

              {/* Item info — large text for kitchen readability */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {/* Quantity — gold accent, very prominent */}
                  <span className="text-lg font-black leading-tight text-warning tabular-nums md:text-xl">
                    {item.quantity}×
                  </span>
                  <span className="text-lg font-bold leading-tight md:text-xl">
                    {item.item_name}
                  </span>
                </div>
                {item.variant_name && (
                  <span className="mt-0.5 block text-sm font-medium text-muted-foreground">
                    {item.variant_name}
                  </span>
                )}
              </div>

              {/* Status dot + badge */}
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    status === "preparing" && "animate-pulse",
                    status === "preparing"
                      ? "bg-warning"
                      : status === "ready"
                        ? "bg-success"
                        : status === "cancelled"
                          ? "bg-destructive"
                          : "bg-muted-foreground",
                  )}
                  aria-hidden
                />
                <Badge
                  variant={config.variant}
                  className={cn(
                    "px-2 py-1 text-xs font-bold",
                    config.badgeClass,
                  )}
                >
                  {config.label}
                </Badge>
              </div>

              {/* Action buttons — 56px min touch target */}
              <div className="flex shrink-0 gap-1">
                {ticket && canRecall && (
                  <Button
                    data-testid={`kds-recall-${ticket.id}`}
                    variant="outline"
                    size="icon"
                    className="size-11 min-h-11 min-w-11 rounded-xl border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:size-14 md:min-h-14 md:min-w-14"
                    aria-label="Thu hồi món"
                    onClick={() => void onRecall(ticket.id)}
                  >
                    <RotateCcw className="size-4 md:size-5" />
                  </Button>
                )}
                {ticket && canBump && (
                  <Button
                    data-testid={`kds-bump-${ticket.id}`}
                    variant="outline"
                    size="icon"
                    className={cn(
                      "size-11 min-h-11 min-w-11 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:size-14 md:min-h-14 md:min-w-14",
                      status === "preparing"
                        ? "border-success/30 bg-success/20 text-success hover:bg-success/30"
                        : "border-warning/30 bg-warning/20 text-warning hover:bg-warning/30",
                    )}
                    aria-label="Chuyển trạng thái món"
                    onClick={() => void onBump(ticket.id)}
                  >
                    {status === "preparing" ? (
                      <Check className="size-5 md:size-6" />
                    ) : (
                      <ChevronRight className="size-5 md:size-6" />
                    )}
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
                className="flex items-center gap-2 px-3 py-2.5 md:gap-3 md:px-4 md:py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-base text-muted-foreground">
                    Món #{String(ticket.order_item_id)}
                  </span>
                </div>
                <Badge
                  variant={config.variant}
                  className={cn(
                    "shrink-0 px-2 py-1 text-xs font-bold",
                    config.badgeClass,
                  )}
                >
                  {config.label}
                </Badge>
                <div className="flex shrink-0 gap-1">
                  {canRecall && (
                    <Button
                      data-testid={`kds-recall-${ticket.id}`}
                      variant="outline"
                      size="icon"
                      className="size-11 min-h-11 min-w-11 rounded-xl border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:size-14 md:min-h-14 md:min-w-14"
                      aria-label="Thu hồi món"
                      onClick={() => void onRecall(ticket.id)}
                    >
                      <RotateCcw className="size-4 md:size-5" />
                    </Button>
                  )}
                  {canBump && (
                    <Button
                      data-testid={`kds-bump-${ticket.id}`}
                      variant="outline"
                      size="icon"
                      className="size-11 min-h-11 min-w-11 rounded-xl border-warning/30 bg-warning/20 text-warning hover:bg-warning/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:size-14 md:min-h-14 md:min-w-14"
                      aria-label="Chuyển trạng thái món"
                      onClick={() => void onBump(ticket.id)}
                    >
                      <ChevronRight className="size-5 md:size-6" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* ── Bump All footer ── */}
      {bumpableTickets.length > 0 && (
        <div className="border-t border-border/50 p-2.5 md:p-3">
          <Button
            variant="default"
            className={cn(
              "min-h-12 w-full rounded-xl text-sm font-bold md:min-h-14 md:text-base",
              // Gold accent for "ready to serve" state (all preparing → ready)
              bumpableTickets.every((t) => t.status === "preparing")
                ? "bg-success text-white hover:opacity-90"
                : "bg-warning text-white hover:opacity-90",
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
