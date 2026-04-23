"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@comtammatu/ui/components/card";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { IconCheck, IconChevronRight, IconRotate, IconToolsKitchen } from "@tabler/icons-react";
import type { KdsOrder, KdsTicket } from "./types";

/* ─── Status config ─── */

const STATUS_CONFIG = {
  pending: {
    label: "Chờ",
    variant: "warning" as const,
  },
  preparing: {
    label: "Đang làm",
    variant: "warning" as const,
  },
  ready: {
    label: "Xong",
    variant: "success" as const,
  },
  cancelled: {
    label: "Đã hủy",
    variant: "destructive" as const,
  },
} as const;

function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label ?? status;
}

function getStatusVariant(
  status: string,
): "warning" | "success" | "destructive" {
  const entry = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  return entry?.variant ?? "warning";
}

const ORDER_TYPE_CONFIG: Record<string, { label: string }> = {
  dine_in: { label: "Tại bàn" },
  takeaway: { label: "Mang về" },
};

/* ─── Age color coding ─── */

function getAgeStyle(minutes: number, isComplete: boolean) {
  if (isComplete) return { text: "text-success", bg: "" };
  if (minutes < 5) return { text: "text-success", bg: "" };
  if (minutes < 10) return { text: "text-warning", bg: "bg-warning/10" };
  return { text: "text-destructive", bg: "bg-destructive/10" };
}

function getCardBorder(overallStatus: string, ageMinutes: number): string {
  if (overallStatus === "cancelled") return "border-destructive/60";
  if (overallStatus === "ready") return "border-success/60";
  if (overallStatus === "preparing") return "border-warning/60";
  if (ageMinutes >= 10) return "border-destructive/70";
  if (ageMinutes >= 5) return "border-warning/70";
  return "border-border";
}

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
      <Badge variant="destructive" className="text-xs font-bold uppercase">
        Đã hủy
      </Badge>
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
  pendingTicketIds: Set<number>;
}

export function OrderCard({
  order,
  onBump,
  onRecall,
  pendingTicketIds,
}: OrderCardProps) {
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
  const typeLabel =
    ORDER_TYPE_CONFIG[order.orderType]?.label ?? order.orderType;

  const pendingTickets = useMemo(
    () => order.tickets.filter((t) => t.status === "pending"),
    [order.tickets],
  );
  const preparingTickets = useMemo(
    () => order.tickets.filter((t) => t.status === "preparing"),
    [order.tickets],
  );
  const hasBatchActions =
    pendingTickets.length > 0 || preparingTickets.length > 0;
  const pendingBatchBusy =
    pendingTickets.length > 0 &&
    pendingTickets.every((ticket) => pendingTicketIds.has(ticket.id));
  const preparingBatchBusy =
    preparingTickets.length > 0 &&
    preparingTickets.every((ticket) => pendingTicketIds.has(ticket.id));

  return (
    <Card
      data-testid={`kds-order-card-${order.orderId}`}
      className={cn(
        "gap-0 py-0 border-l-2 transition-shadow hover:shadow-md",
        borderClass,
        getCardLeftAccent(overallStatus, elapsed),
      )}
    >
      {/* Header */}
      <CardHeader
        className={cn(
          "flex items-start justify-between gap-2 border-b px-3 py-3 md:px-4",
          ageStyle.bg,
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xl font-black leading-none tabular-nums md:text-2xl">
            {order.orderNumber}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="px-2 py-0.5 text-xs font-semibold"
            >
              {typeLabel}
            </Badge>
            {order.tableNumber !== null && (
              <Badge
                variant="secondary"
                className="px-2 py-0.5 text-xs font-semibold"
              >
                Bàn {order.tableNumber}
              </Badge>
            )}
          </div>
        </div>

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
          <span className="text-xs font-bold uppercase opacity-70">phút</span>
        </Badge>
      </CardHeader>

      {/* Items list */}
      <CardContent className="flex-1 divide-y divide-border/30 p-0">
        {order.items.map((item) => {
          const ticket = ticketByItemId.get(item.id);
          const status = ticket?.status ?? "pending";
          const isCancelled = status === "cancelled";
          const isMutating = ticket ? pendingTicketIds.has(ticket.id) : false;
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

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
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

              <Badge
                variant={getStatusVariant(status)}
                className="shrink-0 px-2 py-1 text-xs font-bold"
              >
                {getStatusLabel(status)}
              </Badge>

              <div className="flex shrink-0 gap-1">
                {ticket && canRecall && (
                  <Button
                    data-testid={`kds-recall-${ticket.id}`}
                    variant="outline"
                    size="icon"
                    className="size-11 rounded-md text-muted-foreground md:size-14"
                    aria-label="Thu hồi món"
                    disabled={isMutating}
                    onClick={() => void onRecall(ticket.id)}
                  >
                    {isMutating ? <Spinner /> : <IconRotate aria-hidden />}
                  </Button>
                )}
                {ticket && canBump && (
                  <Button
                    data-testid={`kds-bump-${ticket.id}`}
                    variant={status === "preparing" ? "default" : "secondary"}
                    size="icon"
                    className="size-11 rounded-md md:size-14"
                    aria-label="Chuyển trạng thái món"
                    disabled={isMutating}
                    onClick={() => void onBump(ticket.id)}
                  >
                    {isMutating ? (
                      <Spinner />
                    ) : status === "preparing" ? (
                      <IconCheck aria-hidden />
                    ) : (
                      <IconChevronRight aria-hidden />
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Orphan tickets */}
        {order.tickets
          .filter((t) => !order.items.some((i) => i.id === t.order_item_id))
          .map((ticket) => {
            const isMutating = pendingTicketIds.has(ticket.id);
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
                  variant={getStatusVariant(ticket.status)}
                  className="shrink-0 px-2 py-1 text-xs font-bold"
                >
                  {getStatusLabel(ticket.status)}
                </Badge>
                <div className="flex shrink-0 gap-1">
                  {canRecall && (
                    <Button
                      data-testid={`kds-recall-${ticket.id}`}
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-md text-muted-foreground md:size-14"
                      aria-label="Thu hồi món"
                      disabled={isMutating}
                      onClick={() => void onRecall(ticket.id)}
                    >
                      {isMutating ? <Spinner /> : <IconRotate aria-hidden />}
                    </Button>
                  )}
                  {canBump && (
                    <Button
                      data-testid={`kds-bump-${ticket.id}`}
                      variant={
                        ticket.status === "preparing" ? "default" : "secondary"
                      }
                      size="icon"
                      className="size-11 rounded-md md:size-14"
                      aria-label="Chuyển trạng thái món"
                      disabled={isMutating}
                      onClick={() => void onBump(ticket.id)}
                    >
                      {isMutating ? <Spinner /> : <IconChevronRight aria-hidden />}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </CardContent>

      {/* Batch actions */}
      {hasBatchActions && (
        <CardFooter className="border-t p-2.5 md:p-3">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {pendingTickets.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  "min-h-12 rounded-md text-sm font-bold md:min-h-14 md:text-base",
                  preparingTickets.length === 0 && "sm:col-span-2",
                )}
                disabled={pendingBatchBusy}
                onClick={() => {
                  void Promise.all(pendingTickets.map((t) => onBump(t.id)));
                }}
              >
                {pendingBatchBusy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconToolsKitchen data-icon="inline-start" aria-hidden />
                )}
                Bắt đầu {pendingTickets.length} món chờ
                <IconChevronRight data-icon="inline-end" aria-hidden />
              </Button>
            )}
            {preparingTickets.length > 0 && (
              <Button
                type="button"
                variant="default"
                className={cn(
                  "min-h-12 rounded-md text-sm font-bold md:min-h-14 md:text-base",
                  pendingTickets.length === 0 && "sm:col-span-2",
                )}
                disabled={preparingBatchBusy}
                onClick={() => {
                  void Promise.all(preparingTickets.map((t) => onBump(t.id)));
                }}
              >
                {preparingBatchBusy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconCheck data-icon="inline-start" aria-hidden />
                )}
                Hoàn thành {preparingTickets.length} món
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
