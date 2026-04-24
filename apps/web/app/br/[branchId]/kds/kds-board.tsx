"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { TickProvider } from "./hooks/use-board-tick";
import { useKdsRealtime } from "./hooks/use-kds-realtime";
import { useKdsFilters } from "./hooks/use-kds-filters";
import { useKdsMutations } from "./hooks/use-kds-mutations";
import { useKdsViewMode } from "./hooks/use-kds-view-mode";
import { BoardHeader } from "./components/board-header";
import { StationToggleBar } from "./components/station-toggle-bar";
import { FilterBar } from "./components/filter-bar";
import { OrderGrid } from "./components/order-grid";
import { UnassignedBanner } from "./components/unassigned-banner";
import type {
  KdsBoardProps,
  KdsOrder,
  KdsOrderItem,
  KdsTicket,
  TicketStatusFilter,
} from "./types";

/* ─── Audio beep ─── */

let _audioCtx: AudioContext | null = null;

function playBeep() {
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
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;
    oscillator.start();
    oscillator.stop(_audioCtx.currentTime + 0.15);
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

/* ─── Component ─── */

export function KdsBoard({
  branchId,
  stations,
  fallbackStationIds,
  canMarkReady,
  canRecall,
  initialTickets,
  initialOrders,
  initialOrderItems,
}: KdsBoardProps) {
  const { tickets, orders, orderItems, setTickets, refreshBoardSnapshot } =
    useKdsRealtime({
      branchId,
      initialTickets,
      initialOrders,
      initialOrderItems,
    });

  const filters = useKdsFilters(stations);
  const { mode, setMode } = useKdsViewMode();
  const { handleBump, handleRecall, pendingTicketIds } = useKdsMutations({
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
        (t) => fallbackStationSet.has(t.station_id) && t.status !== "ready",
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

  const prevTicketCountRef = useRef(tickets.length);
  useEffect(() => {
    if (tickets.length > prevTicketCountRef.current) {
      playBeep();
    }
    prevTicketCountRef.current = tickets.length;
  }, [tickets.length]);

  /* ── Derived data ── */

  const filteredTickets = useMemo(() => {
    if (filters.activeStationId === null) return tickets;
    return tickets.filter((t) => t.station_id === filters.activeStationId);
  }, [tickets, filters.activeStationId]);

  const groupedOrders = useMemo<KdsOrder[]>(() => {
    const orderMap = new Map<number, KdsTicket[]>();
    for (const ticket of filteredTickets) {
      const existing = orderMap.get(ticket.order_id) ?? [];
      existing.push(ticket);
      orderMap.set(ticket.order_id, existing);
    }

    const isStationScoped = filters.activeStationId !== null;
    const result: KdsOrder[] = [];
    for (const [orderId, orderTickets] of orderMap) {
      const orderInfo = orders.get(orderId);
      const allItems = (orderItems.get(orderId) ?? []) as KdsOrderItem[];
      // When a station is selected, show only the items routed to tickets
      // at that station — otherwise the card leaks items from other stations.
      const scopedItems = isStationScoped
        ? (() => {
            const ids = new Set(orderTickets.map((t) => t.order_item_id));
            return allItems.filter((i) => ids.has(i.id));
          })()
        : allItems;
      result.push({
        orderId,
        orderNumber: orderInfo?.order_number ?? `#${String(orderId)}`,
        orderType: orderInfo?.order_type ?? "dine_in",
        tableNumber: orderInfo?.tables?.number ?? null,
        createdAt: orderInfo?.created_at ?? orderTickets[0]?.created_at ?? "",
        tickets: orderTickets,
        items: scopedItems,
      });
    }

    result.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return result;
  }, [filteredTickets, orders, orderItems, filters.activeStationId]);

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
      if (t.status !== "ready") {
        counts.set(t.station_id, (counts.get(t.station_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tickets]);

  const totalActiveCount = useMemo(
    () => tickets.filter((t) => t.status !== "ready").length,
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
    <TickProvider>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <BoardHeader
          branchId={branchId}
          pendingCount={pendingCount}
          mode={mode}
          onModeChange={setMode}
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

        <OrderGrid
          displayOrders={displayOrders}
          hasGroupedOrders={groupedOrders.length > 0}
          pendingTicketIds={pendingTicketIds}
          mode={mode}
          canMarkReady={canMarkReady}
          canRecall={canRecall}
          onBump={handleBump}
          onRecall={handleRecall}
        />
      </div>
    </TickProvider>
  );
}
