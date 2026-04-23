"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Button } from "@comtammatu/ui/components/button";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import { IconChefHat, IconFilter, IconX } from "@tabler/icons-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { OrderCard } from "./order-card";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import type {
  KdsTicket,
  KdsOrderInfo,
  KdsOrderItem,
  KdsOrder,
  KdsBoardProps,
  TicketStatusFilter,
  OrderTypeFilter,
  FilterOption,
} from "./types";

/* ─── Constants ─── */

const TICKET_STATUS_OPTIONS: FilterOption<TicketStatusFilter>[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Còn việc" },
  { value: "pending", label: "Có món chờ" },
  { value: "preparing", label: "Có món đang làm" },
  { value: "ready", label: "Có món xong" },
];

const ORDER_TYPE_OPTIONS: FilterOption<OrderTypeFilter>[] = [
  { value: "all", label: "Tất cả" },
  { value: "dine_in", label: "Tại bàn" },
  { value: "takeaway", label: "Mang về" },
];

/* ─── Helpers ─── */

function parseTicketStatusFilter(v: string | null): TicketStatusFilter {
  if (v === "active" || v === "pending" || v === "preparing" || v === "ready") {
    return v;
  }
  return "all";
}

function parseOrderTypeFilter(v: string | null): OrderTypeFilter {
  if (v === "dine_in" || v === "takeaway") return v;
  return "all";
}

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

function buildOrderItemMap(items: KdsOrderItem[]): Map<number, KdsOrderItem[]> {
  const map = new Map<number, KdsOrderItem[]>();
  for (const item of items) {
    const existing = map.get(item.order_id) ?? [];
    existing.push(item);
    map.set(item.order_id, existing);
  }
  return map;
}

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

/* ─── Component ─── */

export function KdsBoard({
  branchId,
  stations,
  initialTickets,
  initialOrders,
  initialOrderItems,
}: KdsBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<KdsTicket[]>(initialTickets);
  const [orders, setOrders] = useState<Map<number, KdsOrderInfo>>(
    () => new Map(initialOrders.map((o) => [o.id, o])),
  );
  const [orderItems, setOrderItems] = useState<Map<number, KdsOrderItem[]>>(
    () => buildOrderItemMap(initialOrderItems),
  );
  const [pendingTicketIds, setPendingTicketIds] = useState<Set<number>>(
    () => new Set(),
  );
  const supabaseRef = useRef(createClient());
  const prevTicketCountRef = useRef(tickets.length);
  const ordersRef = useRef(orders);
  const lastSnapshotSyncRef = useRef(Date.now());
  const pendingTicketIdsRef = useRef<Set<number>>(new Set());

  const replaceQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const beginTicketMutation = useCallback((ticketId: number): boolean => {
    if (pendingTicketIdsRef.current.has(ticketId)) return false;

    const next = new Set(pendingTicketIdsRef.current);
    next.add(ticketId);
    pendingTicketIdsRef.current = next;
    setPendingTicketIds(next);
    return true;
  }, []);

  const endTicketMutation = useCallback((ticketId: number) => {
    if (!pendingTicketIdsRef.current.has(ticketId)) return;

    const next = new Set(pendingTicketIdsRef.current);
    next.delete(ticketId);
    pendingTicketIdsRef.current = next;
    setPendingTicketIds(next);
  }, []);

  /* ── URL filter state ── */

  const activeStationId = useMemo((): number | null => {
    const raw = searchParams.get("station");
    if (!raw || raw === "all") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return stations.some((s) => s.id === n) ? n : null;
  }, [searchParams, stations]);

  const ticketStatusFilter = useMemo(
    () => parseTicketStatusFilter(searchParams.get("status")),
    [searchParams],
  );

  const orderTypeFilter = useMemo(
    () => parseOrderTypeFilter(searchParams.get("orderType")),
    [searchParams],
  );

  /* ── Ref sync ── */

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  /* ── Audio on new tickets ── */

  useEffect(() => {
    if (tickets.length > prevTicketCountRef.current) {
      playBeep();
    }
    prevTicketCountRef.current = tickets.length;
  }, [tickets.length]);

  /* ── Fetch helpers ── */

  const fetchOrderInfo = useCallback(async (orderId: number) => {
    const supabase = supabaseRef.current;

    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, order_type, table_id, created_at, tables(number)",
        )
        .eq("id", orderId)
        .single(),
      supabase
        .from("order_items")
        .select(
          "id, order_id, item_name, variant_name, quantity, unit_price, status",
        )
        .eq("order_id", orderId),
    ]);

    if (orderRes.data) {
      setOrders((prev) => {
        const next = new Map(prev);
        next.set(orderId, orderRes.data as unknown as KdsOrderInfo);
        return next;
      });
    }

    if (itemsRes.data) {
      setOrderItems((prev) => {
        const next = new Map(prev);
        next.set(orderId, itemsRes.data as unknown as KdsOrderItem[]);
        return next;
      });
    }
  }, []);

  const syncOrderItemStatusFromTicket = useCallback((ticket: KdsTicket) => {
    setOrderItems((prev) => {
      const items = prev.get(ticket.order_id);
      if (!items) return prev;

      let changed = false;
      const nextItems = items.map((item) => {
        if (item.id !== ticket.order_item_id || item.status === ticket.status) {
          return item;
        }
        changed = true;
        return { ...item, status: ticket.status };
      });

      if (!changed) return prev;

      const next = new Map(prev);
      next.set(ticket.order_id, nextItems);
      return next;
    });
  }, []);

  const refreshBoardSnapshot = useCallback(async () => {
    const supabase = supabaseRef.current;

    const { data: freshTickets, error: ticketsError } = await supabase
      .from("kds_tickets")
      .select(
        "id, station_id, order_id, order_item_id, status, bumped_at, created_at",
      )
      .eq("branch_id", branchId)
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at");

    if (ticketsError || !freshTickets) return;

    const nextTickets = freshTickets as KdsTicket[];
    const orderIds = [...new Set(nextTickets.map((ticket) => ticket.order_id))];

    if (orderIds.length === 0) {
      setTickets(nextTickets);
      setOrders(new Map());
      setOrderItems(new Map());
      lastSnapshotSyncRef.current = Date.now();
      return;
    }

    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, order_type, table_id, created_at, tables(number)",
        )
        .in("id", orderIds),
      supabase
        .from("order_items")
        .select(
          "id, order_id, item_name, variant_name, quantity, unit_price, status",
        )
        .in("order_id", orderIds),
    ]);

    if (orderRes.error || itemsRes.error) return;

    setTickets(nextTickets);
    setOrders(
      new Map(
        ((orderRes.data ?? []) as unknown as KdsOrderInfo[]).map((order) => [
          order.id,
          order,
        ]),
      ),
    );
    setOrderItems(
      buildOrderItemMap((itemsRes.data ?? []) as unknown as KdsOrderItem[]),
    );
    lastSnapshotSyncRef.current = Date.now();
  }, [branchId]);

  /* ── Realtime subscription ── */

  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`kds-tickets-${String(branchId)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kds_tickets",
          filter: `branch_id=eq.${String(branchId)}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newTicket = payload.new as KdsTicket;
            setTickets((prev) => [...prev, newTicket]);
            syncOrderItemStatusFromTicket(newTicket);
            lastSnapshotSyncRef.current = Date.now();

            const orderId = newTicket.order_id;
            if (!ordersRef.current.has(orderId)) {
              void fetchOrderInfo(orderId);
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as KdsTicket;
            setTickets((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t)),
            );
            syncOrderItemStatusFromTicket(updated);
            lastSnapshotSyncRef.current = Date.now();
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: number };
            setTickets((prev) => prev.filter((t) => t.id !== deleted.id));
            lastSnapshotSyncRef.current = Date.now();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, fetchOrderInfo, syncOrderItemStatusFromTicket]);

  /* ── Polling fallback ── */

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const staleMs = Date.now() - lastSnapshotSyncRef.current;
      if (staleMs < 12000) return;
      void refreshBoardSnapshot();
    }, 12000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshBoardSnapshot]);

  /* ── Derived data ── */

  const filteredTickets = useMemo(() => {
    if (activeStationId === null) return tickets;
    return tickets.filter((t) => t.station_id === activeStationId);
  }, [tickets, activeStationId]);

  const groupedOrders = useMemo(() => {
    const orderMap = new Map<number, KdsTicket[]>();
    for (const ticket of filteredTickets) {
      const existing = orderMap.get(ticket.order_id) ?? [];
      existing.push(ticket);
      orderMap.set(ticket.order_id, existing);
    }

    const result: KdsOrder[] = [];
    for (const [orderId, orderTickets] of orderMap) {
      const orderInfo = orders.get(orderId);
      result.push({
        orderId,
        orderNumber: orderInfo?.order_number ?? `#${String(orderId)}`,
        orderType: orderInfo?.order_type ?? "dine_in",
        tableNumber: orderInfo?.tables?.number ?? null,
        createdAt: orderInfo?.created_at ?? orderTickets[0]?.created_at ?? "",
        tickets: orderTickets,
        items: orderItems.get(orderId) ?? [],
      });
    }

    result.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return result;
  }, [filteredTickets, orders, orderItems]);

  const displayOrders = useMemo(() => {
    let list = groupedOrders;
    if (orderTypeFilter !== "all") {
      list = list.filter((o) => o.orderType === orderTypeFilter);
    }
    if (ticketStatusFilter !== "all") {
      list = list.filter((o) =>
        orderMatchesTicketStatus(o.tickets, ticketStatusFilter),
      );
    }
    return list;
  }, [groupedOrders, orderTypeFilter, ticketStatusFilter]);

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

  const hasFilters =
    activeStationId !== null ||
    ticketStatusFilter !== "all" ||
    orderTypeFilter !== "all";

  /* ── Keyboard shortcuts ── */

  useKeyboardShortcut([
    {
      key: "Escape",
      handler: () => {
        if (hasFilters) {
          replaceQuery({ station: null, status: null, orderType: null });
        }
      },
    },
  ]);

  /* ── Bump / Recall ── */

  const handleBump = useCallback(
    async (ticketId: number) => {
      if (!beginTicketMutation(ticketId)) return;

      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const nextStatus =
            t.status === "pending"
              ? "preparing"
              : t.status === "preparing"
                ? "ready"
                : t.status;
          return { ...t, status: nextStatus };
        }),
      );

      try {
        const sb = supabaseRef.current;
        const { error } = await sb.rpc("bump_kds_ticket", {
          p_ticket_id: ticketId,
        });

        if (error) {
          toast.error("Không thể cập nhật trạng thái món. Vui lòng thử lại.");
          await refreshBoardSnapshot();
        }
      } finally {
        endTicketMutation(ticketId);
      }
    },
    [beginTicketMutation, endTicketMutation, refreshBoardSnapshot],
  );

  const handleRecall = useCallback(
    async (ticketId: number) => {
      if (!beginTicketMutation(ticketId)) return;

      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const prevStatus =
            t.status === "ready"
              ? "preparing"
              : t.status === "preparing"
                ? "pending"
                : t.status;
          return { ...t, status: prevStatus };
        }),
      );

      try {
        const sb = supabaseRef.current;
        const { error } = await sb.rpc("recall_kds_ticket", {
          p_ticket_id: ticketId,
        });

        if (error) {
          toast.error("Không thể thu hồi trạng thái món. Vui lòng thử lại.");
          await refreshBoardSnapshot();
        }
      } finally {
        endTicketMutation(ticketId);
      }
    },
    [beginTicketMutation, endTicketMutation, refreshBoardSnapshot],
  );

  /* ── Render ── */

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Header — single compact row */}
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <EmployeePortalBackControl className="h-7 rounded-full px-1.5 text-xs" />
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            KDS #{branchId}
          </span>
        </div>
        <Badge
          variant={pendingCount > 0 ? "warning" : "outline"}
          className="rounded-full px-3 py-1 text-xs"
        >
          {pendingCount > 0
            ? `${pendingCount} món cần nhận`
            : "Không có món chờ"}
        </Badge>
      </div>

      {/* Station toggle bar */}
      <div className="border-b px-3 py-2 md:px-4">
        <ScrollArea className="min-w-0 flex-1">
          <ToggleGroup
            type="single"
            value={activeStationId === null ? "all" : String(activeStationId)}
            onValueChange={(value) => {
              if (!value) return;
              replaceQuery({ station: value === "all" ? null : value });
            }}
            variant="outline"
            className="h-auto justify-start gap-2 rounded-lg border bg-card p-2"
          >
            <ToggleGroupItem
              value="all"
              className="min-h-10 shrink-0 gap-2 px-3 text-sm font-semibold"
              aria-label="Tất cả trạm"
            >
              Tất cả
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
              >
                {totalActiveCount}
              </Badge>
            </ToggleGroupItem>
            {stations.map((station) => (
              <ToggleGroupItem
                key={station.id}
                value={String(station.id)}
                className="min-h-10 shrink-0 gap-2 px-3 text-sm font-semibold"
                aria-label={`Trạm ${station.name}`}
              >
                {station.name}
                <Badge
                  variant="secondary"
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                >
                  {stationCounts.get(station.id) ?? 0}
                </Badge>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </ScrollArea>
      </div>

      {/* IconFilter bar */}
      <div className="border-b px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <IconFilter className="size-4 shrink-0" aria-hidden />
            <span className="hidden text-sm font-medium sm:inline">Lọc</span>
          </div>
          <Select
            value={ticketStatusFilter}
            onValueChange={(v) => {
              if (v === "all") replaceQuery({ status: null });
              else replaceQuery({ status: v });
            }}
          >
            <SelectTrigger
              className="h-10 min-h-10 w-auto min-w-28 shrink-0 rounded-lg text-sm md:min-w-36"
              aria-label="Lọc theo trạng thái món"
            >
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TICKET_STATUS_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-sm"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={orderTypeFilter}
            onValueChange={(v) => {
              if (v === "all") replaceQuery({ orderType: null });
              else replaceQuery({ orderType: v });
            }}
          >
            <SelectTrigger
              className="h-10 min-h-10 w-auto min-w-24 shrink-0 rounded-lg text-sm md:min-w-32"
              aria-label="Lọc theo loại đơn"
            >
              <SelectValue placeholder="Loại đơn" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ORDER_TYPE_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-sm"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() =>
                replaceQuery({ station: null, status: null, orderType: null })
              }
            >
              <IconX data-icon="inline-start" aria-hidden />
              Xóa lọc
            </Button>
          )}

          {displayOrders.length > 0 && (
            <span className="ml-auto text-sm font-semibold tabular-nums text-muted-foreground">
              {displayOrders.length} đơn
            </span>
          )}
        </div>
      </div>

      {/* Order grid */}
      <ScrollArea className="flex-1">
        {displayOrders.length === 0 ? (
          <div className="flex min-h-80 items-center justify-center p-6 md:min-h-96">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconChefHat />
                </EmptyMedia>
                <EmptyTitle>
                  {groupedOrders.length > 0
                    ? "Không có đơn phù hợp bộ lọc"
                    : "Bếp đang rảnh"}
                </EmptyTitle>
                <EmptyDescription>
                  {groupedOrders.length > 0
                    ? "Thay đổi bộ lọc để xem thêm đơn."
                    : "Chưa có đơn hàng mới."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 md:p-4 xl:grid-cols-3 2xl:grid-cols-4">
            {displayOrders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                onBump={handleBump}
                onRecall={handleRecall}
                pendingTicketIds={pendingTicketIds}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
