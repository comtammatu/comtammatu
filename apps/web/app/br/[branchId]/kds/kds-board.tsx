"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import { ChefHat, Filter } from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { OrderCard } from "./order-card";
import type { KdsStation, KdsTicket, KdsOrderInfo, KdsOrderItem } from "./page";
import { Card, CardContent } from "@comtammatu/ui/components/card";

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
  { value: "dine_in", label: "Tại bàn" },
  { value: "takeaway", label: "Mang về" },
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

function buildOrderItemMap(items: KdsOrderItem[]): Map<number, KdsOrderItem[]> {
  const map = new Map<number, KdsOrderItem[]>();
  for (const item of items) {
    const existing = map.get(item.order_id) ?? [];
    existing.push(item);
    map.set(item.order_id, existing);
  }
  return map;
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
    () => buildOrderItemMap(initialOrderItems),
  );
  const supabaseRef = useRef(createClient());
  const prevTicketCountRef = useRef(tickets.length);
  const ordersRef = useRef(orders);
  const lastSnapshotSyncRef = useRef(Date.now());

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
            syncOrderItemStatusFromTicket(newTicket);
            lastSnapshotSyncRef.current = Date.now();

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
        await refreshBoardSnapshot();
      }
    },
    [refreshBoardSnapshot],
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
        await refreshBoardSnapshot();
      }
    },
    [refreshBoardSnapshot],
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
    return Math.max(
      ...displayOrders.map((order) => getElapsedMinutes(order.createdAt)),
    );
  }, [displayOrders]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-3 py-3 md:px-4">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <EmployeePortalBackControl className="h-8 rounded-full px-2 text-xs" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                KDS chi nhánh #{branchId}
              </span>
            </div>
            <Badge variant={pendingCount > 0 ? "warning" : "outline"} className="rounded-full px-3 py-1">
              {pendingCount > 0
                ? `${pendingCount} món cần nhận`
                : "Không có món chờ"}
            </Badge>
          </div>

          <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Màn hình bếp
                </p>
                <p className="text-sm font-medium text-foreground">
                  Ưu tiên món chờ mới và đơn chờ lâu, rồi xử lý theo trạm.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {displayOrders.length} đơn hiển thị
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {totalActiveCount} món còn việc
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {preparingCount} món đang làm
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {oldestActiveOrderMinutes} phút lâu nhất
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {readyCount} món chờ ra
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border/40 px-3 py-3 md:px-4">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3">
          <div className="flex shrink-0 items-stretch">
            <ScrollArea className="min-w-0 flex-1">
              <ToggleGroup
                type="single"
                value={activeStationId === null ? "all" : String(activeStationId)}
                onValueChange={(value) => {
                  // ToggleGroup "single" allows empty; treat that as "all"
                  if (!value) return;
                  replaceQuery({ station: value === "all" ? null : value });
                }}
                variant="outline"
                className="h-auto justify-start gap-2 rounded-lg border bg-card p-2"
              >
                <ToggleGroupItem
                  value="all"
                  className="min-h-11 shrink-0 gap-2 px-4 text-sm font-semibold"
                  aria-label="Tất cả trạm"
                >
                  Tất cả
                  <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs font-semibold">
                    {totalActiveCount}
                  </Badge>
                </ToggleGroupItem>
                {stations.map((station) => (
                  <ToggleGroupItem
                    key={station.id}
                    value={String(station.id)}
                    className="min-h-11 shrink-0 gap-2 px-4 text-sm font-semibold"
                    aria-label={`Trạm ${station.name}`}
                  >
                    {station.name}
                    <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs font-semibold">
                      {stationCounts.get(station.id) ?? 0}
                    </Badge>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ScrollArea>
          </div>
        </div>
      </div>

      <div className="border-b border-border/30 bg-secondary/35 px-3 py-2 md:px-4">
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="rounded-lg border bg-muted/30 text-card-foreground px-3 py-2.5">
            <div className="relative flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
              <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Filter className="size-4 shrink-0" aria-hidden />
                <span className="hidden text-sm font-medium sm:inline">
                  Bộ lọc
                </span>
              </div>
              <Select
                value={ticketStatusFilter}
                onValueChange={(v) => {
                  if (v === "all") replaceQuery({ status: null });
                  else replaceQuery({ status: v });
                }}
              >
                <SelectTrigger
                  className="h-10 min-h-10 w-auto min-w-32 shrink-0 rounded-lg text-sm md:h-11 md:min-h-11 md:min-w-40"
                  aria-label="Lọc theo trạng thái món"
                >
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_STATUS_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-sm"
                    >
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
                  className="h-10 min-h-10 w-auto min-w-28 shrink-0 rounded-lg text-sm md:h-11 md:min-h-11 md:min-w-36"
                  aria-label="Lọc theo loại đơn"
                >
                  <SelectValue placeholder="Loại đơn" />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_TYPE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-sm"
                    >
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
            <Card>
              <CardContent
                className="flex min-h-80 flex-col items-center justify-center gap-4 px-6 py-10 text-center md:min-h-96"
              >
                <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
                  <ChefHat className="size-4" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold">
                    {groupedOrders.length > 0
                      ? "Không có đơn phù hợp bộ lọc"
                      : "Bếp đang rảnh"}
                  </p>
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                    {groupedOrders.length > 0
                      ? "Thử thay đổi bộ lọc để xem thêm đơn."
                      : "Chưa có đơn hàng mới."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-3 p-3 md:grid-cols-2 md:p-4 xl:grid-cols-3 2xl:grid-cols-4">
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
