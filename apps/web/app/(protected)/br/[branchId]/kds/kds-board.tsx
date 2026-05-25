"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import { playAppSignal } from "@lib/audio-signal";
import { toast } from "@comtammatu/ui/components/sonner";
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
  KdsKitchenSendBatch,
  KdsMenuLimitRow,
  KdsOrder,
  KdsOrderItem,
  KdsTicket,
} from "./types";

/* ─── Helpers ─── */

function orderHasKitchenWork(tickets: KdsTicket[]): boolean {
  return tickets.some(
    (ticket) => ticket.status === "pending" || ticket.status === "preparing",
  );
}

function isActiveKitchenTicket(ticket: KdsTicket): boolean {
  return ticket.status === "pending" || ticket.status === "preparing";
}

function getTicketItemLabel(
  ticket: KdsTicket,
  orderItemById: Map<number, KdsOrderItem>,
): string {
  return orderItemById.get(ticket.order_item_id)?.item_name ?? "món";
}

function getTicketOrderLabel(
  ticket: KdsTicket,
  orders: Map<number, { order_number: string }>,
): string {
  return orders.get(ticket.order_id)?.order_number ?? String(ticket.order_id);
}

function getTicketBatchKind(
  ticket: KdsTicket,
  kitchenBatches: Map<number, KdsKitchenSendBatch>,
): string | null {
  if (ticket.kitchen_send_batch_id === null) return null;
  return kitchenBatches.get(ticket.kitchen_send_batch_id)?.kind ?? null;
}

function getKitchenQueueRank(order: KdsOrder): number {
  const statuses = order.tickets.map((ticket) => ticket.status);
  if (statuses.some((status) => status === "preparing")) return 0;
  if (statuses.some((status) => status === "pending")) {
    return order.isPriority ? 1 : 2;
  }
  if (statuses.some((status) => status === "ready")) return 3;
  return 4;
}

function compareKdsOrdersForKitchenQueue(a: KdsOrder, b: KdsOrder): number {
  const rankDelta = getKitchenQueueRank(a) - getKitchenQueueRank(b);
  if (rankDelta !== 0) return rankDelta;

  const timeDelta =
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDelta !== 0) return timeDelta;

  return a.groupKey.localeCompare(b.groupKey);
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const boardRootRef = useRef<HTMLDivElement | null>(null);
  const lastMissingItemRefreshRef = useRef<string | null>(null);

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
  const showUnassignedBanner =
    stations.length > 1 && fallbackStationIds.length > 0;

  const filterUnassigned = useCallback(() => {
    const firstFallback = fallbackStationIds[0];
    if (firstFallback !== undefined) {
      filters.setStation(String(firstFallback));
    }
  }, [fallbackStationIds, filters]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      if (next) {
        playAppSignal("kds", true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardRootRef.current);
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
    if (document.fullscreenElement === root) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (!document.fullscreenElement) {
      void root.requestFullscreen().catch(() => undefined);
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

  /* ── Operational alerts on ticket changes ── */

  const prevTicketsByIdRef = useRef<Map<number, KdsTicket> | null>(null);
  useEffect(() => {
    const previous = prevTicketsByIdRef.current;
    const nextTicketsById = new Map(
      tickets.map((ticket) => [ticket.id, ticket]),
    );

    if (previous === null) {
      prevTicketsByIdRef.current = nextTicketsById;
      return;
    }

    let hasNewActiveTicket = false;

    for (const ticket of tickets) {
      if (previous.has(ticket.id) || !isActiveKitchenTicket(ticket)) {
        continue;
      }
      hasNewActiveTicket = true;
      const itemLabel = getTicketItemLabel(ticket, orderItemById);
      const orderLabel = getTicketOrderLabel(ticket, orders);
      const isAppend = getTicketBatchKind(ticket, kitchenBatches) === "append";
      toast.info(isAppend ? "Món thêm mới" : "Phiếu bếp mới", {
        description: `${itemLabel} - đơn #${orderLabel}`,
      });
    }

    if (soundEnabled && hasNewActiveTicket) {
      playAppSignal("kds");
    }

    prevTicketsByIdRef.current = nextTicketsById;
  }, [kitchenBatches, orderItemById, orders, soundEnabled, tickets]);

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
      <div
        ref={boardRootRef}
        className="flex h-dvh min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <div className="sticky top-0 z-30 shrink-0 border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <BoardHeader
            branchId={branchId}
            pendingCount={pendingCount}
            mode={mode}
            soundEnabled={soundEnabled}
            isFullscreen={isFullscreen}
            onModeChange={setMode}
            onSoundToggle={toggleSound}
            onFullscreenToggle={toggleFullscreen}
            menuLimits={menuLimits}
            onMenuLimitsChange={setMenuLimitRows}
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
            onFilter={filterUnassigned}
          />
        </div>

        {mode === "focus" ? (
          <FocusView
            orders={displayOrders}
            hasGroupedOrders={activeGroupedOrders.length > 0}
            pendingTicketIds={pendingTicketIds}
            canMarkReady={canMarkReady}
            canRecall={canRecall}
            onRecall={handleRecall}
            onOutOfStock={handleOutOfStock}
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
            onOutOfStock={handleOutOfStock}
            onCompleteTickets={handleCompleteTickets}
          />
        )}
      </div>
    </TickProvider>
  );
}
