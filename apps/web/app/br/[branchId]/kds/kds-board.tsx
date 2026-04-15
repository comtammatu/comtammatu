"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import { ChefHat, Filter, Flame, PackageCheck } from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { OrderCard } from "./order-card";
import type { KdsStation, KdsTicket, KdsOrderInfo, KdsOrderItem } from "./page";
import { EmptyState } from "@/components/foundation/ui-patterns";

/* ─── Types ─── */

/** Grouped order with its tickets and items for display */
export interface KdsOrder {
  orderId: number;
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  createdAt: string;
  tickets: KdsTicket[];
  items: KdsOrderItem[];
}

interface KdsBoardProps {
  branchId: number;
  stations: KdsStation[];
  initialTickets: KdsTicket[];
  initialOrders: KdsOrderInfo[];
  initialOrderItems: KdsOrderItem[];
}

/** URL query: `status` — lọc đơn theo trạng thái ticket */
type TicketStatusFilter = "all" | "active" | "pending" | "preparing" | "ready";

/** URL query: `orderType` */
type OrderTypeFilter = "all" | "dine_in" | "takeaway";

const TICKET_STATUS_OPTIONS: { value: TicketStatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Còn việc" },
  { value: "pending", label: "Có món chờ" },
  { value: "preparing", label: "Có món đang làm" },
  { value: "ready", label: "Có món xong" },
];

const ORDER_TYPE_OPTIONS: { value: OrderTypeFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "dine_in", label: "Tại chỗ" },
  { value: "takeaway", label: "Mang đi" },
];

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

function getElapsedMinutes(createdAt: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
  );
}

/* ─── Audio beep helper (reuses single AudioContext) ─── */

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
    // Audio not available — silently ignore
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
    () => {
      const map = new Map<number, KdsOrderItem[]>();
      for (const item of initialOrderItems) {
        const existing = map.get(item.order_id) ?? [];
        existing.push(item);
        map.set(item.order_id, existing);
      }
      return map;
    },
  );
  const supabaseRef = useRef(createClient());
  const prevTicketCountRef = useRef(tickets.length);
  const ordersRef = useRef(orders);

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

  // Keep ordersRef in sync
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Play beep on new tickets
  useEffect(() => {
    if (tickets.length > prevTicketCountRef.current) {
      playBeep();
    }
    prevTicketCountRef.current = tickets.length;
  }, [tickets.length]);

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

  // Subscribe to kds_tickets realtime
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

            // Fetch order info if we don't have it
            const orderId = newTicket.order_id;
            if (!ordersRef.current.has(orderId)) {
              void fetchOrderInfo(orderId);
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as KdsTicket;
            setTickets((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t)),
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: number };
            setTickets((prev) => prev.filter((t) => t.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, fetchOrderInfo]);

  // Filter tickets by station
  const filteredTickets = useMemo(() => {
    if (activeStationId === null) return tickets;
    return tickets.filter((t) => t.station_id === activeStationId);
  }, [tickets, activeStationId]);

  // Group tickets by order_id
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

    // Sort by creation time (oldest first)
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

  // Optimistic bump handler
  const handleBump = useCallback(
    async (ticketId: number) => {
      // Optimistic update
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

      const sb = supabaseRef.current;
      const { error } = await sb.rpc("bump_kds_ticket", {
        p_ticket_id: ticketId,
      });

      if (error) {
        toast.error("Không thể cập nhật trạng thái món. Vui lòng thử lại.");
        // Revert optimistic update — refetch all active tickets
        const { data: freshTickets } = await sb
          .from("kds_tickets")
          .select(
            "id, station_id, order_id, order_item_id, status, bumped_at, created_at",
          )
          .eq("branch_id", branchId)
          .in("status", ["pending", "preparing", "ready"])
          .order("created_at");

        if (freshTickets) {
          setTickets(freshTickets as KdsTicket[]);
        }
      }
    },
    [branchId],
  );

  // Optimistic recall handler
  const handleRecall = useCallback(
    async (ticketId: number) => {
      // Optimistic update
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

      const sb = supabaseRef.current;
      const { error } = await sb.rpc("recall_kds_ticket", {
        p_ticket_id: ticketId,
      });

      if (error) {
        toast.error("Không thể thu hồi trạng thái món. Vui lòng thử lại.");
        // Revert — refetch
        const { data: freshTickets } = await sb
          .from("kds_tickets")
          .select(
            "id, station_id, order_id, order_item_id, status, bumped_at, created_at",
          )
          .eq("branch_id", branchId)
          .in("status", ["pending", "preparing", "ready"])
          .order("created_at");

        if (freshTickets) {
          setTickets(freshTickets as KdsTicket[]);
        }
      }
    },
    [branchId],
  );

  // Count tickets per station (for badge)
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
  const pendingCount = useMemo(
    () => tickets.filter((t) => t.status === "pending").length,
    [tickets],
  );
  const preparingCount = useMemo(
    () => tickets.filter((t) => t.status === "preparing").length,
    [tickets],
  );
  const readyCount = useMemo(
    () => tickets.filter((t) => t.status === "ready").length,
    [tickets],
  );
  const oldestActiveOrderMinutes = useMemo(() => {
    if (displayOrders.length === 0) return 0;
    return Math.max(...displayOrders.map((order) => getElapsedMinutes(order.createdAt)));
  }, [displayOrders]);
  const hotOrders = useMemo(
    () =>
      displayOrders
        .filter(
          (order) =>
            order.tickets.some((ticket) => ticket.status === "pending") ||
            getElapsedMinutes(order.createdAt) >= 8,
        )
        .slice(0, 4),
    [displayOrders],
  );
  const stationSummary = useMemo(
    () =>
      stations.map((station) => {
        const stationTickets = tickets.filter((ticket) => ticket.station_id === station.id);
        return {
          stationId: station.id,
          stationName: station.name,
          active: stationTickets.filter((ticket) => ticket.status !== "ready").length,
          pending: stationTickets.filter((ticket) => ticket.status === "pending").length,
          preparing: stationTickets.filter((ticket) => ticket.status === "preparing").length,
          ready: stationTickets.filter((ticket) => ticket.status === "ready").length,
        };
      }),
    [stations, tickets],
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="border-b border-border/60 bg-background/90 px-3 py-3 backdrop-blur-xl md:px-4">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4">
          <div className="flex items-center gap-2">
            <EmployeePortalBackControl className="h-8 rounded-full px-2 text-xs" />
            <span className="app-section-label">KDS chi nhánh #{branchId}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <div className="ui-flow-panel rounded-4xl p-5 xl:col-span-3">
              <div className="relative space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="app-section-label">Điều phối line bếp</p>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      Món cần nhận, đang làm, đã xong.
                    </h1>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      Ưu tiên món chờ và món đang chạy.
                    </p>
                  </div>
                  <div className="rounded-full border border-warning/15 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning shadow-sm">
                    {pendingCount > 0
                      ? `${pendingCount} món cần vào bếp ngay`
                      : "Không có món chờ"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="rounded-full border border-border/70 bg-white/70 px-3 py-1.5">
                    {readyCount} món đã xong
                  </span>
                  <span className="rounded-full border border-border/70 bg-white/70 px-3 py-1.5">
                    {preparingCount} món đang chạy
                  </span>
                  <span className="rounded-full border border-border/70 bg-white/70 px-3 py-1.5">
                    {pendingCount} món đang chờ nhận
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="ui-surface-lift rounded-3xl border border-warning/20 bg-warning/10 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                      Hàng chờ
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                      {pendingCount}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Chưa vào line.
                    </p>
                  </div>
                  <div className="ui-surface-lift rounded-3xl border border-primary/15 bg-primary/8 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Đang chế biến
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                      {preparingCount}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Đang xử lý.
                    </p>
                  </div>
                  <div className="ui-surface-lift rounded-3xl border border-success/15 bg-success/10 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-success">
                      Khu pass
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                      {readyCount}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Chờ ra món.
                    </p>
                  </div>
                </div>

                {hotOrders.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Đơn chờ</p>
                      <span className="text-xs text-muted-foreground">
                        Ưu tiên đơn chờ lâu
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {hotOrders.map((order) => (
                        <div
                          key={`hot-${order.orderId}`}
                          className="ui-surface-lift rounded-3xl border border-warning/20 bg-warning/10 p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {order.orderNumber}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {order.tableNumber != null
                                  ? `Bàn ${order.tableNumber}`
                                  : "Mang đi"}
                              </p>
                            </div>
                            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-warning">
                              {getElapsedMinutes(order.createdAt)} phút
                            </span>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            {order.tickets.filter((ticket) => ticket.status === "pending").length}{" "}
                            chờ · {order.tickets.filter((ticket) => ticket.status === "preparing").length}{" "}
                            đang làm
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="app-kpi p-4">
                <p className="app-section-label">Đơn hiển thị</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {displayOrders.length}
                </p>
              </div>
              <div className="app-kpi p-4">
                <p className="app-section-label">Món còn việc</p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold tabular-nums">
                  <Flame className="size-5 text-warning" />
                  {totalActiveCount}
                </p>
              </div>
              <div className="app-kpi p-4">
                    <p className="app-section-label">Order lâu nhất</p>
                    <p className="mt-2 flex items-center gap-2 text-2xl font-semibold tabular-nums">
                      <PackageCheck className="size-5 text-info" />
                      {oldestActiveOrderMinutes}m
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border/40 bg-background/75 px-3 py-3 md:px-4">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stationSummary.map((station) => (
              <button
                key={`summary-${station.stationId}`}
                type="button"
                className={cn(
                  "ui-surface-lift rounded-3xl border p-4 text-left shadow-sm transition-all",
                  activeStationId === station.stationId
                    ? "border-primary/30 bg-primary/10"
                    : "border-border/60 bg-white/82",
                )}
                onClick={() =>
                  replaceQuery({
                    station:
                      activeStationId === station.stationId
                        ? null
                        : String(station.stationId),
                  })
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {station.stationName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {station.active} món còn việc
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {station.ready} xong
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-warning/12 px-2.5 py-1 font-semibold text-warning">
                    {station.pending} chờ
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                    {station.preparing} đang làm
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div
            className={cn(
              "flex shrink-0 items-stretch border-t border-border/40 pt-3",
            )}
          >
        <ScrollArea className="min-w-0 flex-1">
          <div className="flex gap-1.5">
            <button
              type="button"
              className={cn(
                "ui-surface-lift flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-2xl px-3 text-sm font-bold transition-colors duration-150 md:min-h-14 md:px-5 md:text-base",
                activeStationId === null
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-secondary text-secondary-foreground hover:bg-muted",
              )}
              onClick={() => replaceQuery({ station: null })}
            >
              Tất cả
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-black tabular-nums",
                  activeStationId === null
                    ? "bg-accent-foreground/15 text-accent-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {totalActiveCount}
              </span>
            </button>

            {/* Per-station tabs */}
            {stations.map((station) => {
              const isActive = activeStationId === station.id;
              const count = stationCounts.get(station.id) ?? 0;
              return (
                <button
                  key={station.id}
                  type="button"
                  className={cn(
                    "ui-surface-lift flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-2xl px-3 text-sm font-bold transition-colors duration-150 md:min-h-14 md:px-5 md:text-base",
                    isActive
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "bg-secondary text-secondary-foreground hover:bg-muted",
                  )}
                  onClick={() => replaceQuery({ station: String(station.id) })}
                >
                  {station.name}
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-black tabular-nums",
                      isActive
                        ? "bg-accent-foreground/15 text-accent-foreground"
                        : count > 0
                          ? "bg-warning/20 text-warning"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
          </div>
        </div>
      </div>

      <div className="border-b border-border/30 bg-secondary/45 px-3 py-2 md:px-4">
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="ui-flow-panel rounded-3xl px-3 py-2.5">
          <div className="relative flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Filter className="size-4 shrink-0" aria-hidden />
              <span className="hidden text-sm font-medium sm:inline">Bộ lọc</span>
            </div>
            <Select
              value={ticketStatusFilter}
              onValueChange={(v) => {
                if (v === "all") replaceQuery({ status: null });
                else replaceQuery({ status: v });
              }}
            >
              <SelectTrigger
                className="h-10 min-h-10 w-auto min-w-32 shrink-0 rounded-2xl text-sm md:h-11 md:min-h-11 md:min-w-40"
                aria-label="Lọc theo trạng thái món"
              >
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-sm">
                    {opt.label}
                  </SelectItem>
                ))}
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
                className="h-10 min-h-10 w-auto min-w-28 shrink-0 rounded-2xl text-sm md:h-11 md:min-h-11 md:min-w-36"
                aria-label="Lọc theo loại đơn"
              >
                <SelectValue placeholder="Loại đơn" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-sm">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {displayOrders.length > 0 && (
              <span className="ml-auto text-sm font-semibold tabular-nums text-muted-foreground">
                {displayOrders.length} đơn
              </span>
            )}
          </div>
        </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {displayOrders.length === 0 ? (
          <div className="mx-auto w-full max-w-screen-2xl p-3 md:p-4">
            <EmptyState
              icon={<ChefHat className="size-12" />}
              title={
                groupedOrders.length > 0
                  ? "Không có đơn phù hợp bộ lọc"
                  : "Bếp đang rảnh"
              }
              description={
                groupedOrders.length > 0
                  ? "Thử thay đổi bộ lọc để xem thêm đơn."
                  : "Chưa có đơn hàng mới."
              }
              className="min-h-kds-board"
            />
          </div>
        ) : (
          <div className="ui-content-auto mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-3 p-3 md:grid-cols-2 md:p-4 xl:grid-cols-3 2xl:grid-cols-4">
            {displayOrders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                onBump={handleBump}
                onRecall={handleRecall}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
