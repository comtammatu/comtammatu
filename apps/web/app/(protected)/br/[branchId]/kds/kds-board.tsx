"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { TickProvider } from "./hooks/use-board-tick";
import { useKdsRealtime } from "./hooks/use-kds-realtime";
import { useKdsFilters } from "./hooks/use-kds-filters";
import { useKdsMutations } from "./hooks/use-kds-mutations";
import { useKdsViewMode } from "./hooks/use-kds-view-mode";
import { BoardHeader } from "./components/board-header";
import { StationToggleBar } from "./components/station-toggle-bar";
import { FilterBar } from "./components/filter-bar";
import { FocusView } from "./components/focus-view";
import { OrderGrid } from "./components/order-grid";
import { UnassignedBanner } from "./components/unassigned-banner";
import type {
  KdsBoardProps,
  KdsMenuLimitRow,
  KdsOrder,
  KdsOrderItem,
  KdsTicket,
  TicketStatusFilter,
} from "./types";

/* ─── Audio signal ─── */

let _audioCtx: AudioContext | null = null;
let _lastSignalAt = 0;

function playKdsSignal(force = false) {
  const now = Date.now();
  if (!force && now - _lastSignalAt < 2500) return;
  _lastSignalAt = now;

  try {
    if (!_audioCtx) {
      _audioCtx = new AudioContext();
    }
    if (_audioCtx.state === "suspended") {
      void _audioCtx.resume();
    }
    const oscillator = _audioCtx.createOscillator();
    const gainNode = _audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(_audioCtx.destination);
    oscillator.frequency.setValueAtTime(740, _audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(880, _audioCtx.currentTime + 0.08);
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.001, _audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.18,
      _audioCtx.currentTime + 0.02,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      _audioCtx.currentTime + 0.18,
    );
    oscillator.start();
    oscillator.stop(_audioCtx.currentTime + 0.2);
  } catch {
    // Audio not available
  }
}

/* ─── Helpers ─── */

function orderMatchesTicketStatus(
  tickets: KdsTicket[],
  filter: TicketStatusFilter,
): boolean {
  if (filter === "all") return true;
  const statuses = tickets.map((t) => t.status);
  if (filter === "active") {
    return statuses.some((s) => s === "pending" || s === "preparing");
  }
  if (filter === "pending") return statuses.some((s) => s === "pending");
  if (filter === "preparing") return statuses.some((s) => s === "preparing");
  return statuses.some((s) => s === "ready");
}

function isKitchenWorkActive(order: KdsOrder): boolean {
  return order.tickets.some(
    (ticket) => ticket.status === "pending" || ticket.status === "preparing",
  );
}

function compareKdsOrdersNewestFirst(a: KdsOrder, b: KdsOrder): number {
  const activeDelta =
    Number(isKitchenWorkActive(b)) - Number(isKitchenWorkActive(a));
  if (activeDelta !== 0) return activeDelta;

  const timeDelta =
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (timeDelta !== 0) return timeDelta;

  return b.groupKey.localeCompare(a.groupKey);
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
  initialMenuLimits,
}: KdsBoardProps) {
  const {
    tickets,
    orders,
    orderItems,
    kitchenBatches,
    setTickets,
    refreshBoardSnapshot,
  } = useKdsRealtime({
    branchId,
    initialTickets,
    initialOrders,
    initialOrderItems,
    initialKitchenBatches,
  });

  const filters = useKdsFilters(stations);
  const { mode, setMode } = useKdsViewMode();
  const [menuLimits, setMenuLimits] = useState(initialMenuLimits);
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    setMenuLimits(initialMenuLimits);
  }, [initialMenuLimits]);

  const applyMenuLimitPatch = useCallback(
    (patch: {
      menuItemId: number;
      limitQuantity: number | null;
      isDisabled: boolean;
      soldToday: number;
    }) => {
      setMenuLimits((prev) =>
        prev.map((row) =>
          row.menu_item_id === patch.menuItemId
            ? {
                ...row,
                limit_id: row.limit_id ?? row.menu_item_id,
                limit_quantity: patch.limitQuantity,
                is_disabled: patch.isDisabled,
                sold_today: patch.soldToday,
              }
            : row,
        ),
      );
    },
    [],
  );

  const setMenuLimitRows = useCallback((rows: KdsMenuLimitRow[]) => {
    setMenuLimits(rows);
  }, []);

  const {
    handleBump,
    handleRecall,
    handleOutOfStock,
    handleCompleteTickets,
    pendingTicketIds,
  } = useKdsMutations({
    branchId,
    tickets,
    setTickets,
    refreshBoardSnapshot,
    onMenuLimitChanged: applyMenuLimitPatch,
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

  const filterUnassigned = useCallback(() => {
    const firstFallback = fallbackStationIds[0];
    if (firstFallback !== undefined) {
      filters.setStation(String(firstFallback));
    }
  }, [fallbackStationIds, filters]);

  /* ── Audio on new tickets ── */

  const prevActiveTicketIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    const activeTicketIds = new Set(
      tickets
        .filter(
          (ticket) =>
            ticket.status === "pending" || ticket.status === "preparing",
        )
        .map((ticket) => ticket.id),
    );
    const previous = prevActiveTicketIdsRef.current;
    if (
      soundEnabled &&
      previous !== null &&
      [...activeTicketIds].some((ticketId) => !previous.has(ticketId))
    ) {
      playKdsSignal();
    }
    prevActiveTicketIdsRef.current = activeTicketIds;
  }, [soundEnabled, tickets]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      if (next) {
        playKdsSignal(true);
      }
      return next;
    });
  }, []);

  /* ── Derived data ── */

  const filteredTickets = useMemo(() => {
    if (filters.activeStationId === null) return tickets;
    return tickets.filter((t) => t.station_id === filters.activeStationId);
  }, [tickets, filters.activeStationId]);

  const groupedOrders = useMemo<KdsOrder[]>(() => {
    const orderMap = new Map<string, KdsTicket[]>();
    for (const ticket of filteredTickets) {
      const groupKey =
        ticket.kitchen_send_batch_id !== null
          ? `batch-${String(ticket.kitchen_send_batch_id)}`
          : String(ticket.order_id);
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
      const allItems = (orderItems.get(orderId) ?? []) as KdsOrderItem[];
      const ticketItemIds = new Set(
        orderTickets.map((ticket) => ticket.order_item_id),
      );
      const scopedItems = allItems.filter((item) => ticketItemIds.has(item.id));
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
        tickets: orderTickets,
        items: scopedItems,
      });
    }

    result.sort(compareKdsOrdersNewestFirst);

    return result;
  }, [
    filteredTickets,
    orders,
    orderItems,
    kitchenBatches,
    filters.activeStationId,
  ]);

  const displayOrders = useMemo(() => {
    let list = groupedOrders;
    if (filters.orderTypeFilter !== "all") {
      list = list.filter((o) => o.orderType === filters.orderTypeFilter);
    }
    if (filters.ticketStatusFilter !== "all") {
      list = list.filter((o) =>
        orderMatchesTicketStatus(o.tickets, filters.ticketStatusFilter),
      );
    }
    return list;
  }, [groupedOrders, filters.orderTypeFilter, filters.ticketStatusFilter]);

  const pendingCount = useMemo(
    () => tickets.filter((t) => t.status === "pending").length,
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
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 shrink-0 border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <BoardHeader
            branchId={branchId}
            pendingCount={pendingCount}
            mode={mode}
            soundEnabled={soundEnabled}
            onModeChange={setMode}
            onSoundToggle={toggleSound}
            menuLimits={menuLimits}
            onMenuLimitsChange={setMenuLimitRows}
          />

          <UnassignedBanner
            count={unassignedCount}
            onFilter={filterUnassigned}
          />

          <StationToggleBar
            stations={stations}
            activeStationId={filters.activeStationId}
            stationCounts={stationCounts}
            totalActiveCount={totalActiveCount}
            onChange={filters.setStation}
          />

          <FilterBar
            ticketStatusFilter={filters.ticketStatusFilter}
            orderTypeFilter={filters.orderTypeFilter}
            hasFilters={filters.hasFilters}
            displayCount={displayOrders.length}
            onStatusChange={filters.setStatus}
            onOrderTypeChange={filters.setOrderType}
            onClearAll={filters.clearAll}
          />
        </div>

        {mode === "focus" ? (
          <FocusView
            orders={displayOrders}
            hasGroupedOrders={groupedOrders.length > 0}
            pendingTicketIds={pendingTicketIds}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
            onBump={handleBump}
            onRecall={handleRecall}
            onOutOfStock={handleOutOfStock}
            onCompleteTickets={handleCompleteTickets}
          />
        ) : (
          <OrderGrid
            displayOrders={displayOrders}
            hasGroupedOrders={groupedOrders.length > 0}
            pendingTicketIds={pendingTicketIds}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
            onBump={handleBump}
            onRecall={handleRecall}
            onOutOfStock={handleOutOfStock}
            onCompleteTickets={handleCompleteTickets}
          />
        )}
      </div>
    </TickProvider>
  );
}
