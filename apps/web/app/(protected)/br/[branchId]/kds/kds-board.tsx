"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { readDevicePref, writeDevicePref } from "@lib/device-prefs";
import {
  cycleAudioMode,
  getKdsAudioModeKey,
  getKdsSoundPrefKey,
  KDS_TONE_TO_ALERT_KIND,
  playOperationalAlert,
  resolveAudioMode,
  type OperationalAudioMode,
} from "@lib/operational-audio";
import { toast } from "@comtammatu/ui/components/sonner";
import { TickProvider } from "./_hooks/use-board-tick";
import { useKdsRealtime } from "./_hooks/use-kds-realtime";
import { useKdsFilters } from "./_hooks/use-kds-filters";
import { useKdsMutations } from "./_hooks/use-kds-mutations";
import { useKdsViewMode } from "./_hooks/use-kds-view-mode";
import {
  KdsRowEffectsProvider,
  useKdsRowEffects,
} from "./_hooks/use-kds-row-effects";
import {
  KdsNewTicketSignalProvider,
  useKdsNewTicketSignal,
} from "./_hooks/use-kds-new-ticket-signal";
import {
  getKdsOrderItemColumnId,
  getKdsScopedGroupKey,
} from "./_lib/order-columns";
import { getKdsTicketSequenceSortKey } from "./_lib/status-config";
import {
  collectReadyKdsNewTicketAlertGroups,
  getKdsNewTicketAlertGroupKey,
  getKdsNewTicketToastTitle,
  pickHigherPriorityKdsSignalTone,
  type KdsNewTicketAlertGroup,
} from "./_lib/sound-alerts";
import { isKdsActiveTicketStatus } from "./_lib/order-status";
import { KdsBoardTopBar } from "./_components/board-header";
import { StationToggleBar } from "./_components/station-toggle-bar";
import { FilterBar } from "./_components/filter-bar";
import { FocusView } from "./_components/focus-view";
import { OrderGrid } from "./_components/order-grid";
import { KdsCompletionHistorySheet } from "./_components/completion-history-sheet";
import { UnassignedBanner } from "./_components/unassigned-banner";
import type { KdsBoardProps, KdsOrder, KdsOrderItem, KdsTicket } from "./types";

/* ─── Helpers ─── */

function orderHasKitchenWork(tickets: KdsTicket[]): boolean {
  return tickets.some((ticket) => isKdsActiveTicketStatus(ticket.status));
}

function isActiveKitchenTicket(ticket: KdsTicket): boolean {
  return isKdsActiveTicketStatus(ticket.status);
}

function getTicketOrderLabel(
  ticket: Pick<KdsTicket, "order_id">,
  orders: Map<number, { order_number: string }>,
): string {
  return orders.get(ticket.order_id)?.order_number ?? String(ticket.order_id);
}

function getTicketAlertDescription(
  ticket: Pick<KdsTicket, "order_id" | "kitchen_send_batch_id">,
  orders: Map<number, { order_number: string }>,
  kitchenBatches: ReadonlyMap<number, { kitchen_ticket_number: string }>,
): string {
  const orderLabel = getTicketOrderLabel(ticket, orders);
  const batch =
    ticket.kitchen_send_batch_id === null
      ? null
      : (kitchenBatches.get(ticket.kitchen_send_batch_id) ?? null);
  if (batch) {
    return `Phiếu ${batch.kitchen_ticket_number} - đơn #${orderLabel}`;
  }
  return `Đơn #${orderLabel}`;
}

function getTicketBaseGroupKey(ticket: KdsTicket): string {
  return ticket.kitchen_send_batch_id !== null
    ? `batch-${String(ticket.kitchen_send_batch_id)}`
    : String(ticket.order_id);
}

function getKitchenQueueRank(order: KdsOrder): number {
  const statuses = order.tickets.map((ticket) => ticket.status);
  if (statuses.some((status) => status === "preparing")) return 0;
  if (statuses.some(isKdsActiveTicketStatus)) {
    return order.isPriority ? 1 : 2;
  }
  if (statuses.some((status) => status === "ready")) return 3;
  return 4;
}

function compareKdsOrdersForKitchenQueue(a: KdsOrder, b: KdsOrder): number {
  const rankDelta = getKitchenQueueRank(a) - getKitchenQueueRank(b);
  if (rankDelta !== 0) return rankDelta;

  const sequenceDelta = compareKdsOrderTicketSequence(a, b);
  if (sequenceDelta !== 0) return sequenceDelta;

  const timeDelta =
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDelta !== 0) return timeDelta;

  return a.groupKey.localeCompare(b.groupKey);
}

function compareKdsOrderTicketSequence(a: KdsOrder, b: KdsOrder): number {
  const aSequence = getKdsTicketSequenceSortKey(
    a.kitchenTicketNumber,
    a.orderNumber,
  );
  const bSequence = getKdsTicketSequenceSortKey(
    b.kitchenTicketNumber,
    b.orderNumber,
  );

  if (aSequence && bSequence) {
    const primaryDelta = aSequence.primary - bSequence.primary;
    if (primaryDelta !== 0) return primaryDelta;
    return aSequence.secondary - bSequence.secondary;
  }
  if (aSequence) return -1;
  if (bSequence) return 1;
  return 0;
}

/* ─── Component ─── */

export function KdsBoard({
  branchId,
  initialNowMs,
  stations,
  fallbackStationIds,
  canMarkReady,
  canRecall,
  initialTickets,
  initialOrders,
  initialOrderItems,
  initialKitchenBatches,
}: KdsBoardProps) {
  const {
    tickets,
    orders,
    orderItems,
    kitchenBatches,
    setTickets,
    refreshBoardSnapshot,
    consumeRealtimeInsertedTicketIds,
  } = useKdsRealtime({
    branchId,
    initialTickets,
    initialOrders,
    initialOrderItems,
    initialKitchenBatches,
  });

  const newTicketSignalIds = useKdsNewTicketSignal({
    scopeKey: branchId,
    tickets,
    consumeInsertedTicketIds: consumeRealtimeInsertedTicketIds,
  });

  const filters = useKdsFilters(stations);
  const { mode, setMode } = useKdsViewMode();
  // Default OFF; device preference loads after mount (hydration-safe).
  // Without persistence the new-ticket bell resets to muted every reload.
  const [audioMode, setAudioMode] = useState<OperationalAudioMode>("off");
  const audioModeKey = getKdsAudioModeKey(branchId);
  useEffect(() => {
    setAudioMode(
      resolveAudioMode(
        readDevicePref(audioModeKey),
        readDevicePref(getKdsSoundPrefKey(branchId)),
      ),
    );
  }, [audioModeKey, branchId]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [completionHistoryOpen, setCompletionHistoryOpen] = useState(false);
  const boardRootRef = useRef<HTMLDivElement | null>(null);
  const lastMissingItemRefreshRef = useRef<string | null>(null);

  const { handleRecall, handleCompleteTickets, pendingTicketIds } =
    useKdsMutations({
      branchId,
      tickets,
      setTickets,
      refreshBoardSnapshot,
    });

  const fallbackStationSet = useMemo(
    () => new Set(fallbackStationIds),
    [fallbackStationIds],
  );

  const unassignedCount = useMemo(
    () =>
      tickets.filter(
        (t) =>
          fallbackStationSet.has(t.station_id) &&
          t.status !== "ready" &&
          t.status !== "cancelled",
      ).length,
    [tickets, fallbackStationSet],
  );
  const showUnassignedBanner =
    stations.length > 1 && fallbackStationIds.length > 0;

  const filterUnassigned = useCallback(() => {
    const firstFallback = fallbackStationIds[0];
    if (firstFallback !== undefined) {
      filters.setStation(String(firstFallback));
    }
  }, [fallbackStationIds, filters]);

  const toggleSound = useCallback(() => {
    setAudioMode((current) => {
      const next = cycleAudioMode(current);
      // Preview doubles as the user gesture that unblocks audio + speech.
      playOperationalAlert({ kind: "kds.new", mode: next, force: true });
      writeDevicePref(audioModeKey, next);
      return next;
    });
  }, [audioModeKey]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === document.documentElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = boardRootRef.current;
    if (!root) return;
    const fullscreenTarget = document.documentElement;
    if (document.fullscreenElement === fullscreenTarget) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (!document.fullscreenElement) {
      // Keep body-level portals inside fullscreen so overlays remain visible.
      void fullscreenTarget.requestFullscreen().catch(() => undefined);
    }
  }, []);

  /* ── Derived data ── */

  const filteredTickets = useMemo(() => {
    if (filters.activeStationId === null) return tickets;
    return tickets.filter((t) => t.station_id === filters.activeStationId);
  }, [tickets, filters.activeStationId]);

  const orderItemById = useMemo(() => {
    const orderItemById = new Map<number, KdsOrderItem>();
    for (const items of orderItems.values()) {
      for (const item of items) {
        orderItemById.set(item.id, item);
      }
    }
    return orderItemById;
  }, [orderItems]);
  const rowEffects = useKdsRowEffects({
    scopeKey: branchId,
    tickets,
    orderItemById,
  });

  /* ── Operational alerts on ticket changes ── */

  const knownTicketIdsRef = useRef<Set<number> | null>(null);
  const pendingAlertTicketIdsRef = useRef<Set<number>>(new Set());
  const alertedAlertGroupKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const knownTicketIds = knownTicketIdsRef.current;
    const nextTicketIds = new Set(tickets.map((ticket) => ticket.id));

    if (knownTicketIds === null) {
      knownTicketIdsRef.current = nextTicketIds;
      return;
    }

    const pendingAlertTicketIds = pendingAlertTicketIdsRef.current;
    const alertedAlertGroupKeys = alertedAlertGroupKeysRef.current;
    for (const ticket of tickets) {
      if (knownTicketIds.has(ticket.id) || !isActiveKitchenTicket(ticket)) {
        continue;
      }
      const groupKey = getKdsNewTicketAlertGroupKey(ticket);
      if (alertedAlertGroupKeys.has(groupKey)) continue;
      pendingAlertTicketIds.add(ticket.id);
    }

    let nextAlertGroup: KdsNewTicketAlertGroup | null = null;
    const readyAlertGroups = collectReadyKdsNewTicketAlertGroups({
      tickets,
      pendingTicketIds: pendingAlertTicketIds,
      orderItemById,
      kitchenBatches,
    });

    for (const alertGroup of readyAlertGroups) {
      if (alertedAlertGroupKeys.has(alertGroup.groupKey)) continue;
      const winningTone = pickHigherPriorityKdsSignalTone(
        nextAlertGroup?.tone ?? null,
        alertGroup.tone,
      );
      if (nextAlertGroup === null || winningTone !== nextAlertGroup.tone) {
        nextAlertGroup = alertGroup;
      }
      const title = getKdsNewTicketToastTitle(alertGroup.tone);
      toast.info(title, {
        description: getTicketAlertDescription(
          alertGroup.ticket,
          orders,
          kitchenBatches,
        ),
      });
      alertedAlertGroupKeys.add(alertGroup.groupKey);
      for (const ticketId of alertGroup.ticketIds) {
        pendingAlertTicketIds.delete(ticketId);
      }
    }

    if (nextAlertGroup !== null) {
      const tableNumber =
        orders.get(nextAlertGroup.ticket.order_id)?.tables?.number ?? null;
      playOperationalAlert({
        kind: KDS_TONE_TO_ALERT_KIND[nextAlertGroup.tone],
        mode: audioMode,
        slots: {
          tableLabel: tableNumber === null ? undefined : String(tableNumber),
        },
      });
    }

    for (const ticketId of pendingAlertTicketIds) {
      if (!nextTicketIds.has(ticketId)) {
        pendingAlertTicketIds.delete(ticketId);
      }
    }
    for (const ticket of tickets) {
      if (!isActiveKitchenTicket(ticket)) {
        pendingAlertTicketIds.delete(ticket.id);
      }
    }
    const activeAlertGroupKeys = new Set(
      tickets
        .filter(isActiveKitchenTicket)
        .map((ticket) => getKdsNewTicketAlertGroupKey(ticket)),
    );
    for (const groupKey of alertedAlertGroupKeys) {
      if (!activeAlertGroupKeys.has(groupKey)) {
        alertedAlertGroupKeys.delete(groupKey);
      }
    }

    knownTicketIdsRef.current = nextTicketIds;
  }, [audioMode, kitchenBatches, orderItemById, orders, tickets]);

  const missingOrderItemIds = useMemo(
    () => [
      ...new Set(
        filteredTickets
          .map((ticket) => ticket.order_item_id)
          .filter((id) => !orderItemById.has(id)),
      ),
    ],
    [filteredTickets, orderItemById],
  );

  useEffect(() => {
    if (missingOrderItemIds.length === 0) {
      lastMissingItemRefreshRef.current = null;
      return;
    }
    const signature = missingOrderItemIds.join(",");
    if (lastMissingItemRefreshRef.current === signature) return;
    lastMissingItemRefreshRef.current = signature;
    void refreshBoardSnapshot();
  }, [missingOrderItemIds, refreshBoardSnapshot]);

  const groupedOrders = useMemo<KdsOrder[]>(() => {
    const orderMap = new Map<string, KdsTicket[]>();
    for (const ticket of filteredTickets) {
      const orderInfo = orders.get(ticket.order_id);
      const item = orderItemById.get(ticket.order_item_id);
      const columnId = getKdsOrderItemColumnId(
        item,
        orderInfo?.order_type ?? "dine_in",
      );
      const baseGroupKey = getTicketBaseGroupKey(ticket);
      const groupKey = getKdsScopedGroupKey(baseGroupKey, columnId);
      const existing = orderMap.get(groupKey) ?? [];
      existing.push(ticket);
      orderMap.set(groupKey, existing);
    }

    const result: KdsOrder[] = [];
    for (const [groupKey, orderTickets] of orderMap) {
      const firstTicket = orderTickets[0];
      if (!firstTicket) continue;
      const orderId = firstTicket.order_id;
      const orderInfo = orders.get(orderId);
      const batch =
        firstTicket.kitchen_send_batch_id !== null
          ? kitchenBatches.get(firstTicket.kitchen_send_batch_id)
          : undefined;
      const scopedItems = orderTickets
        .map((ticket) => orderItemById.get(ticket.order_item_id))
        .filter((item): item is KdsOrderItem => item !== undefined);
      const isPriority =
        orderInfo?.is_priority === true ||
        scopedItems.some((item) => item.is_priority === true);
      result.push({
        groupKey,
        orderId,
        orderNumber: orderInfo?.order_number ?? `#${String(orderId)}`,
        kitchenTicketNumber:
          batch?.kitchen_ticket_number ??
          orderInfo?.order_number ??
          `#${String(orderId)}`,
        orderType: orderInfo?.order_type ?? "dine_in",
        tableNumber: orderInfo?.tables?.number ?? null,
        createdAt:
          batch?.created_at ?? orderInfo?.created_at ?? firstTicket.created_at,
        sendSeq: batch?.send_seq ?? null,
        sendKind: batch?.kind ?? null,
        isPriority,
        orderNote: orderInfo?.note ?? null,
        tickets: orderTickets,
        items: scopedItems,
      });
    }

    result.sort(compareKdsOrdersForKitchenQueue);

    return result;
  }, [
    filteredTickets,
    orders,
    orderItemById,
    kitchenBatches,
    filters.activeStationId,
  ]);

  const activeGroupedOrders = useMemo(
    () => groupedOrders.filter((order) => orderHasKitchenWork(order.tickets)),
    [groupedOrders],
  );

  const displayOrders = useMemo(() => {
    let list = activeGroupedOrders;
    if (filters.orderTypeFilter !== "all") {
      list = list.filter((o) => o.orderType === filters.orderTypeFilter);
    }
    return list;
  }, [activeGroupedOrders, filters.orderTypeFilter]);

  const pendingCount = useMemo(
    () => tickets.filter((t) => isKdsActiveTicketStatus(t.status)).length,
    [tickets],
  );

  const stationCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const t of tickets) {
      if (t.status !== "ready" && t.status !== "cancelled") {
        counts.set(t.station_id, (counts.get(t.station_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tickets]);

  const totalActiveCount = useMemo(
    () =>
      tickets.filter((t) => t.status !== "ready" && t.status !== "cancelled")
        .length,
    [tickets],
  );

  /* ── Keyboard shortcuts ── */

  useKeyboardShortcut([
    {
      key: "Escape",
      handler: () => {
        if (filters.hasFilters) {
          filters.clearAll();
        }
      },
    },
  ]);

  /* ── Render ── */

  return (
    <TickProvider initialNowMs={initialNowMs}>
      <div
        ref={boardRootRef}
        className="flex h-dvh min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <div className="sticky top-0 z-30 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <KdsBoardTopBar
            branchId={branchId}
            pendingCount={pendingCount}
            mode={mode}
            audioMode={audioMode}
            isFullscreen={isFullscreen}
            onModeChange={setMode}
            onCompletionHistoryOpen={() => setCompletionHistoryOpen(true)}
            onSoundToggle={toggleSound}
            onFullscreenToggle={toggleFullscreen}
            stationControls={
              <StationToggleBar
                stations={stations}
                activeStationId={filters.activeStationId}
                stationCounts={stationCounts}
                totalActiveCount={totalActiveCount}
                onChange={filters.setStation}
              />
            }
            filterControls={
              <FilterBar
                orderTypeFilter={filters.orderTypeFilter}
                hasFilters={filters.hasFilters}
                displayCount={displayOrders.length}
                onOrderTypeChange={filters.setOrderType}
                onClearAll={filters.clearAll}
              />
            }
          />

          <UnassignedBanner
            count={showUnassignedBanner ? unassignedCount : 0}
            branchId={branchId}
            onFilter={filterUnassigned}
          />
        </div>

        <KdsRowEffectsProvider value={rowEffects}>
          <KdsNewTicketSignalProvider value={newTicketSignalIds}>
            {mode === "focus" ? (
              <FocusView
                orders={displayOrders}
                hasGroupedOrders={activeGroupedOrders.length > 0}
                pendingTicketIds={pendingTicketIds}
                canMarkReady={canMarkReady}
                canRecall={canRecall}
                onRecall={handleRecall}
                onCompleteTickets={handleCompleteTickets}
              />
            ) : (
              <OrderGrid
                displayOrders={displayOrders}
                hasGroupedOrders={activeGroupedOrders.length > 0}
                pendingTicketIds={pendingTicketIds}
                canMarkReady={canMarkReady}
                canRecall={canRecall}
                onRecall={handleRecall}
                onCompleteTickets={handleCompleteTickets}
              />
            )}
          </KdsNewTicketSignalProvider>
        </KdsRowEffectsProvider>

        <KdsCompletionHistorySheet
          branchId={branchId}
          open={completionHistoryOpen}
          onOpenChange={setCompletionHistoryOpen}
        />
      </div>
    </TickProvider>
  );
}
