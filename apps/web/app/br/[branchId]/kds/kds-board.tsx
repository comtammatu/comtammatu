"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { createClient } from "@comtammatu/database/supabase/client";
import { ChefHat } from "lucide-react";
import { OrderCard } from "./order-card";
import type {
  KdsStation,
  KdsTicket,
  KdsOrderInfo,
  KdsOrderItem,
} from "./page";

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

/* ─── Audio beep helper ─── */

function playBeep() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
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
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const supabaseRef = useRef(createClient());
  const prevTicketCountRef = useRef(tickets.length);
  const ordersRef = useRef(orders);

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

  const fetchOrderInfo = useCallback(
    async (orderId: number) => {
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
    },
    [],
  );

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
    <div className="flex h-full flex-col">
      {/* Station filter tabs */}
      <div className="border-b border-border/50 bg-background/50">
        <ScrollArea className="w-full">
          <div className="flex gap-1 p-2">
            <Button
              variant={activeStationId === null ? "default" : "ghost"}
              size="sm"
              className={cn(
                "min-h-11 shrink-0 text-sm",
                activeStationId === null && "shadow-sm",
              )}
              onClick={() => setActiveStationId(null)}
            >
              Tat ca
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
                className={cn(
                  "min-h-11 shrink-0 text-sm",
                  activeStationId === station.id && "shadow-sm",
                )}
                onClick={() => setActiveStationId(station.id)}
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

      {/* Order cards grid */}
      <ScrollArea className="flex-1">
        {groupedOrders.length === 0 ? (
          <div className="flex h-full min-h-[60vh] items-center justify-center">
            <div className="text-center">
              <ChefHat className="mx-auto size-16 text-muted-foreground/50" />
              <p className="mt-4 text-lg text-muted-foreground">
                Khong co don hang nao dang cho
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groupedOrders.map((order) => (
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
