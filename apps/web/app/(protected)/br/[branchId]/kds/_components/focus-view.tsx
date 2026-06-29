"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import { AppEmptyState, OperationalBoardCard } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Ban as IconBan,
  Check as IconCheck,
  CheckCheck as IconCheckCheck,
  ChefHat as IconChefHat,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  RotateCcw as IconRotate,
} from "lucide-react";
import { useBoardTick } from "../_hooks/use-board-tick";
import { getAgeStyle, getCardLeftAccent } from "../_lib/age-style";
import {
  getItemRowStatusClass,
  getQuantityStatusClass,
} from "../_lib/item-status-style";
import {
  getKdsRowEffectClass,
  useKdsRowEffectsValue,
} from "../_hooks/use-kds-row-effects";
import { getKdsOrderLabelOverride } from "../_lib/order-columns";
import {
  getStatusLabel,
  getStatusVariant,
  shouldShowTicketStatusBadge,
} from "../_lib/status-config";
import {
  getKdsOrderDisplayStatus,
  isKdsActiveTicketStatus,
} from "../_lib/order-status";
import { AgeBadge } from "./age-badge";
import { CancelledOverlay } from "./cancelled-overlay";
import { OrderNote } from "./order-note";
import { OrderTitleLine } from "./order-title-line";
import { TicketRowMeta } from "./ticket-row-meta";
import type { KdsOrder, KdsTicket } from "../types";

interface FocusViewProps {
  orders: KdsOrder[];
  hasGroupedOrders: boolean;
  pendingTicketIds: Set<number>;
  canMarkReady: boolean;
  canRecall: boolean;
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
}

const ADVANCE_DELAY_MS = 1500;

const KDS_FOCUS_COPY = {
  completeBatch: (count: number) =>
    count > 1 ? `Hoàn tất ${String(count)} món` : "Hoàn tất phiếu bếp",
  completeItem: "Hoàn tất món",
  completeNamedItem: (itemName: string) => `Hoàn tất ${itemName}`,
  nextOrder: "Đơn kế tiếp",
  outOfStock: "Báo hết món",
  outOfStockNamedItem: (itemName: string) => `Báo hết món ${itemName}`,
  previousOrder: "Đơn trước",
  priority: "Ưu tiên",
  quantitySuffix: "×",
  readyAdvance: "Đơn đã sẵn sàng - chuyển đơn kế tiếp",
  recallItem: "Thu hồi món",
  recallNamedItem: (itemName: string) => `Thu hồi ${itemName}`,
} as const;

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
  onRecall,
  onOutOfStock,
  onCompleteTickets,
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
      onRecall={onRecall}
      onOutOfStock={onOutOfStock}
      onCompleteTickets={onCompleteTickets}
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
  onRecall: (ticketId: number) => Promise<void>;
  onOutOfStock: (ticketId: number) => Promise<void>;
  onCompleteTickets: (ticketIds: number[]) => Promise<void>;
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
  onRecall,
  onOutOfStock,
  onCompleteTickets,
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
  const rowEffects = useKdsRowEffectsValue();

  const overallStatus = useMemo(() => {
    return getKdsOrderDisplayStatus({ tickets: order.tickets });
  }, [order.tickets]);

  const handleOutOfStock = useCallback(
    async (ticketId: number, itemName: string) => {
      const ok = await confirm({
        title: "Báo hết món?",
        description: `${itemName} sẽ được hủy khỏi đơn và POS sẽ thấy thông báo để đổi món cho khách.`,
        confirmText: "Báo hết món",
        cancelText: "Giữ lại",
        variant: "destructive",
      });
      if (ok) {
        await onOutOfStock(ticketId);
      }
    },
    [onOutOfStock],
  );

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
    () =>
      order.tickets.filter(
        (t) => !order.items.some((i) => i.id === t.order_item_id),
      ),
    [order.items, order.tickets],
  );

  const activeTickets = useMemo(
    () => order.tickets.filter((t) => isKdsActiveTicketStatus(t.status)),
    [order.tickets],
  );

  const activeTicketIds = useMemo(
    () => activeTickets.map((ticket) => ticket.id),
    [activeTickets],
  );
  const completeBatchBusy =
    activeTickets.length > 0 &&
    activeTickets.every((ticket) => pendingTicketIds.has(ticket.id));
  const completeBatchLabel = KDS_FOCUS_COPY.completeBatch(
    activeTickets.length,
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="mx-auto w-full max-w-screen-2xl p-3">
          <OperationalBoardCard
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
                "flex items-start justify-between gap-3 border-b px-4 py-3 transition-colors",
                heroBg,
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <OrderTitleLine
                    kitchenTicketNumber={order.kitchenTicketNumber}
                    orderNumber={order.orderNumber}
                    orderType={order.orderType}
                    tableNumber={order.tableNumber}
                    contextLabel={getKdsOrderLabelOverride(order)}
                  />
                  {order.isPriority && (
                    <Badge
                      variant="warning"
                      className="px-2 py-1 text-sm font-semibold"
                    >
                      {KDS_FOCUS_COPY.priority}
                    </Badge>
                  )}
                </div>
                <OrderNote note={order.orderNote} className="max-w-full" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {total > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={onPrev}
                      aria-label={KDS_FOCUS_COPY.previousOrder}
                    >
                      <IconChevronLeft aria-hidden />
                    </Button>
                    <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                      {indexLabel}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={onNext}
                      aria-label={KDS_FOCUS_COPY.nextOrder}
                    >
                      <IconChevronRight aria-hidden />
                    </Button>
                  </div>
                )}
                <AgeBadge
                  elapsedMinutes={elapsedMinutes}
                  isComplete={isComplete}
                  size="lg"
                />
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {order.items.map((item) => {
                const ticket = ticketByItemId.get(item.id);
                const status = ticket?.status ?? "pending";
                const isCancelled = status === "cancelled";
                const isMutating = ticket
                  ? pendingTicketIds.has(ticket.id)
                  : false;
                const canCompleteByStatus =
                  !isCancelled && isKdsActiveTicketStatus(status);
                const canRecallByStatus = !isCancelled && status === "ready";
                const allowComplete = canCompleteByStatus && canMarkReady;
                const allowOutOfStock = canCompleteByStatus && canMarkReady;
                const allowRecall = canRecallByStatus && canRecall;
                const rowEffect = ticket ? rowEffects.get(ticket.id) : null;

                return (
                  <div
                    key={ticket?.id ?? item.id}
                    data-testid={`kds-focus-item-${String(item.id)}`}
                    data-kds-effect={rowEffect ?? undefined}
                    className={cn(
                      "relative grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 bg-card px-3 py-2 transition-colors duration-150 md:px-4",
                      getItemRowStatusClass(status),
                      getKdsRowEffectClass(rowEffect ?? null),
                      isCancelled && "opacity-100",
                    )}
                  >
                    {isCancelled && <CancelledOverlay />}
                    <span
                      className={cn(
                        "flex h-9 w-14 items-center justify-center rounded-md px-2 font-mono text-2xl font-semibold leading-none tabular-nums ring-1 ring-inset",
                        getQuantityStatusClass(status),
                      )}
                    >
                      {item.quantity}
                      {KDS_FOCUS_COPY.quantitySuffix}
                    </span>
                    <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="min-w-0 break-words text-xl font-semibold leading-7">
                        {item.item_name}
                      </span>
                      {item.is_priority && (
                        <Badge
                          variant="warning"
                          className="h-6 rounded-md px-2 py-0 text-sm font-semibold leading-none"
                        >
                          {KDS_FOCUS_COPY.priority}
                        </Badge>
                      )}
                      {item.variant_name && (
                        <span className="min-w-0 break-words text-base font-medium leading-6 text-muted-foreground">
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
                          className="h-6 rounded-md px-2 py-0 text-sm font-semibold leading-none"
                        >
                          {getStatusLabel(status)}
                        </Badge>
                      )}

                      {ticket &&
                        (allowComplete || allowRecall || allowOutOfStock) && (
                          <>
                            {allowOutOfStock && (
                              <Button
                                data-testid={`kds-out-of-stock-${String(ticket.id)}`}
                                type="button"
                                variant="destructive"
                                size="touch"
                                className="w-12 px-0"
                                disabled={isMutating}
                                onClick={() =>
                                  void handleOutOfStock(
                                    ticket.id,
                                    item.item_name,
                                  )
                                }
                                aria-label={KDS_FOCUS_COPY.outOfStockNamedItem(
                                  item.item_name,
                                )}
                              >
                                {isMutating ? (
                                  <Spinner data-icon="inline-start" />
                                ) : (
                                  <IconBan
                                    data-icon="inline-start"
                                    aria-hidden
                                  />
                                )}
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
                                aria-label={KDS_FOCUS_COPY.recallNamedItem(
                                  item.item_name,
                                )}
                              >
                                {isMutating ? (
                                  <Spinner data-icon="inline-start" />
                                ) : (
                                  <IconRotate
                                    data-icon="inline-start"
                                    aria-hidden
                                  />
                                )}
                              </Button>
                            )}
                            {allowComplete && (
                              <Button
                                data-testid={`kds-complete-ticket-${String(ticket.id)}`}
                                type="button"
                                variant="default"
                                size="touch"
                                className="w-12 px-0"
                                disabled={isMutating}
                                onClick={() =>
                                  void onCompleteTickets([ticket.id])
                                }
                                aria-label={KDS_FOCUS_COPY.completeNamedItem(
                                  item.item_name,
                                )}
                              >
                                {isMutating ? (
                                  <Spinner data-icon="inline-start" />
                                ) : (
                                  <IconCheck
                                    data-icon="inline-start"
                                    aria-hidden
                                  />
                                )}
                              </Button>
                            )}
                          </>
                        )}
                    </div>
                  </div>
                );
              })}

              {orphanTickets.map((ticket) => {
                const status = ticket.status;
                const isCancelled = status === "cancelled";
                const isMutating = pendingTicketIds.has(ticket.id);
                const canCompleteByStatus =
                  !isCancelled && isKdsActiveTicketStatus(status);
                const canRecallByStatus = !isCancelled && status === "ready";
                const allowComplete = canCompleteByStatus && canMarkReady;
                const allowOutOfStock = canCompleteByStatus && canMarkReady;
                const allowRecall = canRecallByStatus && canRecall;
                const itemLabel = `Món #${String(ticket.order_item_id)}`;
                const rowEffect = rowEffects.get(ticket.id) ?? null;

                return (
                  <div
                    key={ticket.id}
                    data-kds-effect={rowEffect ?? undefined}
                    className={cn(
                      "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-card px-3 py-2 transition-colors duration-150",
                      getItemRowStatusClass(status),
                      getKdsRowEffectClass(rowEffect),
                    )}
                  >
                    <span className="min-w-0 break-words text-base font-semibold leading-6 text-muted-foreground">
                      {itemLabel}
                    </span>
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      {shouldShowTicketStatusBadge(status) && (
                        <Badge
                          variant={getStatusVariant(status)}
                          className="h-5 rounded-md px-2 py-0 text-xs font-semibold leading-none"
                        >
                          {getStatusLabel(status)}
                        </Badge>
                      )}
                      {(allowComplete || allowRecall || allowOutOfStock) && (
                        <>
                          {allowOutOfStock && (
                            <Button
                              data-testid={`kds-out-of-stock-${String(ticket.id)}`}
                              type="button"
                              variant="destructive"
                              size="touch"
                              className="w-12 px-0"
                              disabled={isMutating}
                              onClick={() =>
                                void handleOutOfStock(ticket.id, itemLabel)
                              }
                              aria-label={KDS_FOCUS_COPY.outOfStock}
                            >
                              {isMutating ? (
                                <Spinner data-icon="inline-start" />
                              ) : (
                                <IconBan data-icon="inline-start" aria-hidden />
                              )}
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
                              aria-label={KDS_FOCUS_COPY.recallItem}
                            >
                              {isMutating ? (
                                <Spinner data-icon="inline-start" />
                              ) : (
                                <IconRotate
                                  data-icon="inline-start"
                                  aria-hidden
                                />
                              )}
                            </Button>
                          )}
                          {allowComplete && (
                            <Button
                              data-testid={`kds-complete-ticket-${String(ticket.id)}`}
                              type="button"
                              variant="default"
                              size="touch"
                              className="w-12 px-0"
                              disabled={isMutating}
                              onClick={() =>
                                void onCompleteTickets([ticket.id])
                              }
                              aria-label={KDS_FOCUS_COPY.completeItem}
                            >
                              {isMutating ? (
                                <Spinner data-icon="inline-start" />
                              ) : (
                                <IconCheck
                                  data-icon="inline-start"
                                  aria-hidden
                                />
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </OperationalBoardCard>
        </div>
      </ScrollArea>

      {/* Sticky batch action bar */}
      {canMarkReady && activeTickets.length > 0 && (
        <div className="border-t bg-card p-3">
          <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-2">
            <Button
              data-testid={`kds-focus-complete-order-${order.groupKey}`}
              type="button"
              variant="default"
              size="touch-lg"
              className="gap-2"
              disabled={completeBatchBusy}
              onClick={() => {
                void onCompleteTickets(activeTicketIds);
              }}
            >
              {completeBatchBusy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconCheckCheck data-icon="inline-start" aria-hidden />
              )}
              {completeBatchLabel}
            </Button>
          </div>
        </div>
      )}

      {/* Celebration overlay when order is fully ready */}
      {isCelebrating && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-success/15 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
        >
          <div className="flex flex-col items-center gap-2 rounded-md bg-success/95 px-4 py-3 text-success-foreground shadow-md">
            <IconCheck className="size-6" aria-hidden />
            <span className="font-heading text-base font-semibold">
              {KDS_FOCUS_COPY.readyAdvance}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
