"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import { ChefHat, Filter } from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { OrderCard } from "./order-card";
import type { KdsStation, KdsTicket, KdsOrderInfo, KdsOrderItem } from "./page";

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- KDS RPCs not in generated types yet
      const sb = supabaseRef.current as any;
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- KDS RPCs not in generated types yet
      const sb = supabaseRef.current as any;
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

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Back (narrow column) + station tabs — one bar, tabs scroll horizontally */}
      <div
        className={cn(
          "flex shrink-0 items-stretch border-b border-border/50 bg-background/50",
          "pt-[max(0.25rem,env(safe-area-inset-top,0px))]",
        )}
      >
        <div className="flex shrink-0 items-center border-r border-border/40 pl-1 sm:pl-1.5">
          <EmployeePortalBackControl className="h-11 justify-center rounded-none sm:rounded-md" />
        </div>
        <ScrollArea className="min-w-0 flex-1">
          <div className="flex gap-1 p-2">
            <Button
              variant={activeStationId === null ? "default" : "ghost"}
              size="sm"
              className="min-h-11 shrink-0 text-sm shadow-none"
              onClick={() => replaceQuery({ station: null })}
            >
              Tất cả
              <Badge
                variant="secondary"
                className={cn(
                  "ml-1.5 text-[10px]",
                  activeStationId === null &&
                    "bg-primary-foreground/20 text-primary-foreground",
                )}
              >
                {totalActiveCount}
              </Badge>
            </Button>
            {stations.map((station) => (
              <Button
                key={station.id}
                variant={activeStationId === station.id ? "default" : "ghost"}
                size="sm"
                className="min-h-11 shrink-0 text-sm shadow-none"
                onClick={() => replaceQuery({ station: String(station.id) })}
              >
                {station.name}
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-1.5 text-[10px]",
                    activeStationId === station.id &&
                      "bg-primary-foreground/20 text-primary-foreground",
                  )}
                >
                  {stationCounts.get(station.id) ?? 0}
                </Badge>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Filters: trạng thái + loại đơn (URL: status, orderType) */}
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 bg-muted/20 px-2 py-2 sm:px-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Filter className="size-4 shrink-0" aria-hidden />
          <span className="hidden text-xs font-medium sm:inline">Lọc</span>
        </div>
        <Select
          value={ticketStatusFilter}
          onValueChange={(v) => {
            if (v === "all") replaceQuery({ status: null });
            else replaceQuery({ status: v });
          }}
        >
          <SelectTrigger
            className="h-11 min-h-11 w-[min(100%,11rem)] min-w-[9.5rem] sm:w-52"
            aria-label="Lọc theo trạng thái món"
          >
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {TICKET_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
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
            className="h-11 min-h-11 w-[min(100%,11rem)] min-w-[9.5rem] sm:w-44"
            aria-label="Lọc theo loại đơn"
          >
            <SelectValue placeholder="Loại đơn" />
          </SelectTrigger>
          <SelectContent>
            {ORDER_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Order cards grid */}
      <ScrollArea className="flex-1">
        {displayOrders.length === 0 ? (
          <div className="flex h-full min-h-[60vh] items-center justify-center">
            <div className="text-center">
              <ChefHat className="mx-auto size-16 text-muted-foreground/50" />
              <p className="mt-4 text-lg text-muted-foreground">
                {groupedOrders.length > 0
                  ? "Không có đơn phù hợp bộ lọc"
                  : "Không có đơn hàng nào đang chờ"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
