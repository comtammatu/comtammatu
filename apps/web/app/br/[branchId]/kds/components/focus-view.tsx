"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import { AppEmptyState } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Check as IconCheck,
  ChefHat as IconChefHat,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  RotateCcw as IconRotate,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import { useBoardTick } from "../hooks/use-board-tick";
import { getAgeStyle, getCardLeftAccent } from "../lib/age-style";
import {
  getOrderTypeLabel,
  getStatusLabel,
  getStatusVariant,
} from "../lib/status-config";
import { AgeBadge } from "./age-badge";
import { CancelledOverlay } from "./cancelled-overlay";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsTicket } from "../types";

interface FocusViewProps {
  orders: KdsOrder[];
  hasGroupedOrders: boolean;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
}

const ADVANCE_DELAY_MS = 1500;

function isOrderAllReady(order: KdsOrder): boolean {
  if (order.tickets.length === 0) return false;
  return order.tickets.every(
    (t) => t.status === "ready" || t.status === "cancelled",
  );
}

function findNextActiveIndex(orders: KdsOrder[], from: number): number {
  for (let offset = 1; offset <= orders.length; offset++) {
    const idx = (from + offset) % orders.length;
    const candidate = orders[idx];
    if (candidate && !isOrderAllReady(candidate)) return idx;
  }
  return -1;
}

export function FocusView({
  orders,
  hasGroupedOrders,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  onBump,
  onRecall,
}: FocusViewProps) {
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const currentIndex = useMemo(() => {
    if (!focusKey) return -1;
    return orders.findIndex((o) => o.groupKey === focusKey);
  }, [focusKey, orders]);

  const current = currentIndex >= 0 ? (orders[currentIndex] ?? null) : null;
  const allReady = current ? isOrderAllReady(current) : false;
  // Derived key (not state) — drives both the celebration overlay and the
  // single transition-armed effect below. Avoids the cleanup-on-rerender
  // race that would clobber the advance timer when celebratingKey was state.
  const celebrateKey = allReady && current ? current.groupKey : null;

  // Sync focus when current order disappears or none chosen yet.
  useEffect(() => {
    if (orders.length === 0) {
      if (focusKey !== null) setFocusKey(null);
      return;
    }
    const stillExists = focusKey && orders.some((o) => o.groupKey === focusKey);
    if (!stillExists) {
      // Prefer first non-ready order; fall back to first.
      const firstActive = orders.find((o) => !isOrderAllReady(o));
      const next = firstActive ?? orders[0];
      if (next) setFocusKey(next.groupKey);
    }
  }, [orders, focusKey]);

  // Latest orders snapshot for the timer callback (avoids stale closure
  // without forcing the advance effect to re-run on every order mutation).
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Auto-advance: arm exactly once per "becomes all ready" transition.
  // Effect re-runs only when the celebrate target changes (groupKey →
  // groupKey or → null), not on every render.
  useEffect(() => {
    if (!celebrateKey) return;
    const completedKey = celebrateKey;
    const timer = window.setTimeout(() => {
      const list = ordersRef.current;
      const idx = list.findIndex((o) => o.groupKey === completedKey);
      const nextIdx = findNextActiveIndex(list, idx >= 0 ? idx : 0);
      if (nextIdx >= 0) {
        const nextOrder = list[nextIdx];
        if (nextOrder) setFocusKey(nextOrder.groupKey);
      }
    }, ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [celebrateKey]);

  const goNext = useCallback(() => {
    if (orders.length === 0) return;
    const base = currentIndex >= 0 ? currentIndex : -1;
    const nextIdx = (base + 1 + orders.length) % orders.length;
    const next = orders[nextIdx];
    if (next) setFocusKey(next.groupKey);
  }, [orders, currentIndex]);

  const goPrev = useCallback(() => {
    if (orders.length === 0) return;
    const base = currentIndex >= 0 ? currentIndex : 0;
    const prevIdx = (base - 1 + orders.length) % orders.length;
    const prev = orders[prevIdx];
    if (prev) setFocusKey(prev.groupKey);
  }, [orders, currentIndex]);

  if (orders.length === 0 || !current) {
    return (
      <ScrollArea className="min-h-0 flex-1">
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
      </ScrollArea>
    );
  }

  return (
    <FocusOrderPanel
      order={current}
      indexLabel={`${String(currentIndex + 1)}/${String(orders.length)}`}
      total={orders.length}
      pendingTicketIds={pendingTicketIds}
      canMarkReady={canMarkReady}
      canRecall={canRecall}
      isCelebrating={allReady}
      onBump={onBump}
      onRecall={onRecall}
      onPrev={goPrev}
      onNext={goNext}
    />
  );
}

interface FocusOrderPanelProps {
  order: KdsOrder;
  indexLabel: string;
  total: number;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  isCelebrating: boolean;
  onBump: (ticketId: number) => Promise<void>;
  onRecall: (ticketId: number) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
}

function FocusOrderPanel({
  order,
  indexLabel,
  total,
  pendingTicketIds,
  canMarkReady,
  canRecall,
  isCelebrating,
  onBump,
  onRecall,
  onPrev,
  onNext,
}: FocusOrderPanelProps) {
  const now = useBoardTick();

  const createdMs = useMemo(
    () => new Date(order.createdAt).getTime(),
    [order.createdAt],
  );

  const ticketByItemId = useMemo(() => {
    const map = new Map<number, KdsTicket>();
    for (const t of order.tickets) {
      map.set(t.order_item_id, t);
    }
    return map;
  }, [order.tickets]);

  const itemIds = useMemo(
    () => new Set(order.items.map((item) => item.id)),
    [order.items],
  );

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
  const elapsedMinutes = useMemo(
    () => Math.max(0, Math.floor((now - createdMs) / 60000)),
    [now, createdMs],
  );
  // Hero tint mirrors the grid card header — keeps urgency signaling
  // consistent across modes; success tint when the order is fully done.
  const ageStyle = getAgeStyle(elapsedMinutes, isComplete);
  const heroBg = isComplete ? "bg-success/10" : ageStyle.bg || "bg-card";

  const orphanTickets = useMemo(
    () => order.tickets.filter((t) => !itemIds.has(t.order_item_id)),
    [itemIds, order.tickets],
  );

  const pendingTickets = useMemo(
    () => order.tickets.filter((t) => t.status === "pending"),
    [order.tickets],
  );
  const preparingTickets = useMemo(
    () => order.tickets.filter((t) => t.status === "preparing"),
    [order.tickets],
  );

  const pendingBatchBusy =
    pendingTickets.length > 0 &&
    pendingTickets.every((t) => pendingTicketIds.has(t.id));
  const preparingBatchBusy =
    preparingTickets.length > 0 &&
    preparingTickets.every((t) => pendingTicketIds.has(t.id));

  const typeLabel = getOrderTypeLabel(order.orderType);
  const isAppend = order.sendKind === "append";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Navigation strip */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 md:px-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="gap-1.5"
          onClick={onPrev}
          disabled={total <= 1}
          aria-label="Đơn trước"
        >
          <IconChevronLeft data-icon="inline-start" aria-hidden />
          Trước
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Đơn
          </span>
          <span className="font-mono text-base font-semibold tabular-nums">
            {indexLabel}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="gap-1.5"
          onClick={onNext}
          disabled={total <= 1}
          aria-label="Đơn kế tiếp"
        >
          Kế tiếp
          <IconChevronRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl p-2 md:p-4">
          <Card
            data-testid={`kds-focus-card-${order.groupKey}`}
            className={cn(
              "gap-0 overflow-hidden border-l-4 py-0",
              getCardLeftAccent(overallStatus, elapsedMinutes),
            )}
          >
            {/* Hero header — tinted by elapsed-time tier (warning ≥5ph,
                destructive ≥10ph, success when complete). */}
            <div
              className={cn(
                "flex items-start justify-between gap-3 border-b px-3 py-3 transition-colors md:px-5 md:py-5",
                heroBg,
              )}
            >
              <div className="flex min-w-0 flex-col gap-2">
                <span className="font-mono text-2xl font-semibold leading-none tabular-nums">
                  {order.kitchenTicketNumber}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {isAppend && (
                    <Badge
                      variant="destructive"
                      className="px-2 py-0.5 text-xs font-semibold"
                    >
                      Gọi thêm
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="px-2 py-0.5 text-xs font-semibold"
                  >
                    HĐ {order.orderNumber}
                  </Badge>
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
                  {order.sendSeq !== null && (
                    <Badge
                      variant="secondary"
                      className="px-2 py-0.5 text-xs font-semibold"
                    >
                      Lần {order.sendSeq}
                    </Badge>
                  )}
                </div>
              </div>
              <AgeBadge
                elapsedMinutes={elapsedMinutes}
                isComplete={isComplete}
                size="lg"
              />
            </div>

            <CardContent className="flex flex-col divide-y divide-border/60 p-0">
              {order.items.map((item) => {
                const ticket = ticketByItemId.get(item.id);
                const status = ticket?.status ?? "pending";
                const isCancelled = status === "cancelled";
                const isMutating = ticket
                  ? pendingTicketIds.has(ticket.id)
                  : false;
                const canBumpByStatus =
                  !isCancelled &&
                  (status === "pending" || status === "preparing");
                const canRecallByStatus =
                  !isCancelled &&
                  (status === "preparing" || status === "ready");
                const allowBump = canBumpByStatus && canMarkReady;
                const allowRecall = canRecallByStatus && canRecall;

                return (
                  <div
                    key={item.id}
                    data-testid={`kds-focus-item-${String(item.id)}`}
                    className={cn(
                      "relative flex flex-col gap-3 px-3 py-3 md:px-5 md:py-5",
                      status === "ready" && "opacity-60",
                      isCancelled && "opacity-100",
                    )}
                  >
                    {isCancelled && <CancelledOverlay />}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-2xl font-semibold leading-tight text-warning tabular-nums">
                            {item.quantity}×
                          </span>
                          <span className="break-words text-2xl font-semibold leading-tight">
                            {item.item_name}
                          </span>
                        </div>
                        {item.variant_name && (
                          <span className="mt-1 block text-base font-medium text-muted-foreground">
                            {item.variant_name}
                          </span>
                        )}
                        <TicketRowMeta
                          note={item.note}
                          modifiers={item.modifiers}
                          sides={item.sides}
                        />
                      </div>
                      <Badge
                        variant={getStatusVariant(status)}
                        className="px-3 py-1 text-sm font-semibold"
                      >
                        {getStatusLabel(status)}
                      </Badge>
                    </div>

                    {ticket && (allowBump || allowRecall) && (
                      <div className="flex flex-wrap gap-2">
                        {allowRecall && (
                          <Button
                            type="button"
                            variant="outline"
                            size="touch"
                            className="flex-1 gap-2"
                            disabled={isMutating}
                            onClick={() => void onRecall(ticket.id)}
                            aria-label={`Thu hồi ${item.item_name}`}
                          >
                            {isMutating ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <IconRotate
                                data-icon="inline-start"
                                aria-hidden
                              />
                            )}
                            Thu hồi
                          </Button>
                        )}
                        {allowBump && (
                          <Button
                            type="button"
                            variant={
                              status === "preparing" ? "default" : "secondary"
                            }
                            size="touch-lg"
                            className="flex-[2] gap-2"
                            disabled={isMutating}
                            onClick={() => void onBump(ticket.id)}
                            aria-label={`Chuyển trạng thái ${item.item_name}`}
                          >
                            {isMutating ? (
                              <Spinner data-icon="inline-start" />
                            ) : status === "preparing" ? (
                              <IconCheck data-icon="inline-start" aria-hidden />
                            ) : (
                              <IconChevronRight
                                data-icon="inline-start"
                                aria-hidden
                              />
                            )}
                            {status === "preparing"
                              ? "Đánh dấu xong"
                              : "Bắt đầu chế biến"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {orphanTickets.map((ticket) => {
                const status = ticket.status;
                const isCancelled = status === "cancelled";
                const isMutating = pendingTicketIds.has(ticket.id);
                const canBumpByStatus =
                  !isCancelled &&
                  (status === "pending" || status === "preparing");
                const canRecallByStatus =
                  !isCancelled &&
                  (status === "preparing" || status === "ready");
                const allowBump = canBumpByStatus && canMarkReady;
                const allowRecall = canRecallByStatus && canRecall;

                return (
                  <div
                    key={ticket.id}
                    className="flex flex-col gap-3 px-3 py-3 md:px-5 md:py-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base text-muted-foreground">
                        Món #{String(ticket.order_item_id)}
                      </span>
                      <Badge
                        variant={getStatusVariant(status)}
                        className="px-3 py-1 text-sm font-semibold"
                      >
                        {getStatusLabel(status)}
                      </Badge>
                    </div>
                    {(allowBump || allowRecall) && (
                      <div className="flex gap-2">
                        {allowRecall && (
                          <Button
                            type="button"
                            variant="outline"
                            size="touch"
                            className="flex-1 gap-2"
                            disabled={isMutating}
                            onClick={() => void onRecall(ticket.id)}
                            aria-label="Thu hồi món"
                          >
                            {isMutating ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <IconRotate
                                data-icon="inline-start"
                                aria-hidden
                              />
                            )}
                            Thu hồi
                          </Button>
                        )}
                        {allowBump && (
                          <Button
                            type="button"
                            variant={
                              status === "preparing" ? "default" : "secondary"
                            }
                            size="touch-lg"
                            className="flex-[2] gap-2"
                            disabled={isMutating}
                            onClick={() => void onBump(ticket.id)}
                          >
                            {isMutating ? (
                              <Spinner data-icon="inline-start" />
                            ) : status === "preparing" ? (
                              <IconCheck data-icon="inline-start" aria-hidden />
                            ) : (
                              <IconChevronRight
                                data-icon="inline-start"
                                aria-hidden
                              />
                            )}
                            {status === "preparing"
                              ? "Đánh dấu xong"
                              : "Bắt đầu chế biến"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Sticky batch action bar */}
      {canMarkReady &&
        (pendingTickets.length > 0 || preparingTickets.length > 0) && (
          <div className="border-t bg-card px-3 py-3 md:px-4">
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
              {pendingTickets.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="touch-lg"
                  className={cn(
                    "gap-2",
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
                </Button>
              )}
              {preparingTickets.length > 0 && (
                <Button
                  type="button"
                  variant="default"
                  size="touch-lg"
                  className={cn(
                    "gap-2",
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
          </div>
        )}

      {/* Celebration overlay when order is fully ready */}
      {isCelebrating && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-success/15 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in"
        >
          <div className="flex flex-col items-center gap-2 rounded-lg bg-success/95 px-6 py-4 text-success-foreground shadow-md">
            <IconCheck className="size-10" aria-hidden />
            <span className="font-heading text-base font-semibold">
              Đã xong đơn — chuyển đơn kế tiếp
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
