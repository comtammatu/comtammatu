"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { KdsOrderInfo, KdsOrderItem, KdsTicket } from "../types";

const POLL_INTERVAL_MS = 12_000;
const POLL_STALE_MS = 12_000;

function buildOrderItemMap(items: KdsOrderItem[]): Map<number, KdsOrderItem[]> {
  const map = new Map<number, KdsOrderItem[]>();
  for (const item of items) {
    const existing = map.get(item.order_id) ?? [];
    existing.push(item);
    map.set(item.order_id, existing);
  }
  return map;
}

export interface UseKdsRealtimeArgs {
  branchId: number;
  initialTickets: KdsTicket[];
  initialOrders: KdsOrderInfo[];
  initialOrderItems: KdsOrderItem[];
}

export interface KdsRealtimeState {
  tickets: KdsTicket[];
  orders: Map<number, KdsOrderInfo>;
  orderItems: Map<number, KdsOrderItem[]>;
  setTickets: React.Dispatch<React.SetStateAction<KdsTicket[]>>;
  refreshBoardSnapshot: () => Promise<void>;
}

export function useKdsRealtime({
  branchId,
  initialTickets,
  initialOrders,
  initialOrderItems,
}: UseKdsRealtimeArgs): KdsRealtimeState {
  const [tickets, setTickets] = useState<KdsTicket[]>(initialTickets);
  const [orders, setOrders] = useState<Map<number, KdsOrderInfo>>(
    () => new Map(initialOrders.map((o) => [o.id, o])),
  );
  const [orderItems, setOrderItems] = useState<Map<number, KdsOrderItem[]>>(
    () => buildOrderItemMap(initialOrderItems),
  );

  const supabaseRef = useRef(createClient());
  const ordersRef = useRef(orders);
  const lastSnapshotSyncRef = useRef(Date.now());
  const refreshBoardSnapshotRef =
    useRef<() => Promise<void>>(() => Promise.resolve());
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

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
          "id, order_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides",
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
          "id, order_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides",
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

  useEffect(() => {
    refreshBoardSnapshotRef.current = refreshBoardSnapshot;
  }, [refreshBoardSnapshot]);

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
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // Skip the FIRST SUBSCRIBED — board state is already seeded from
        // RSC props (initialTickets/initialOrders/initialOrderItems).
        // Every SUBSCRIBED after that is a genuine reconnect: refetch a
        // fresh snapshot so we don't carry stale state from events that
        // fired during the disconnect window.
        if (!initialSubscribeSeenRef.current) {
          initialSubscribeSeenRef.current = true;
          return;
        }
        void refreshBoardSnapshotRef.current();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, fetchOrderInfo, syncOrderItemStatusFromTicket]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const staleMs = Date.now() - lastSnapshotSyncRef.current;
      if (staleMs < POLL_STALE_MS) return;
      void refreshBoardSnapshot();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshBoardSnapshot]);

  return {
    tickets,
    orders,
    orderItems,
    setTickets,
    refreshBoardSnapshot,
  };
}
