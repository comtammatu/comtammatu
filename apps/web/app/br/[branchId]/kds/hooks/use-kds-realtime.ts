"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import type {
  KdsKitchenSendBatch,
  KdsOrderInfo,
  KdsOrderItem,
  KdsTicket,
} from "../types";

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
  initialKitchenBatches: KdsKitchenSendBatch[];
}

export interface KdsRealtimeState {
  tickets: KdsTicket[];
  orders: Map<number, KdsOrderInfo>;
  orderItems: Map<number, KdsOrderItem[]>;
  kitchenBatches: Map<number, KdsKitchenSendBatch>;
  setTickets: React.Dispatch<React.SetStateAction<KdsTicket[]>>;
  refreshBoardSnapshot: () => Promise<void>;
}

export function useKdsRealtime({
  branchId,
  initialTickets,
  initialOrders,
  initialOrderItems,
  initialKitchenBatches,
}: UseKdsRealtimeArgs): KdsRealtimeState {
  const [tickets, setTickets] = useState<KdsTicket[]>(initialTickets);
  const [orders, setOrders] = useState<Map<number, KdsOrderInfo>>(
    () => new Map(initialOrders.map((o) => [o.id, o])),
  );
  const [orderItems, setOrderItems] = useState<Map<number, KdsOrderItem[]>>(
    () => buildOrderItemMap(initialOrderItems),
  );
  const [kitchenBatches, setKitchenBatches] = useState<
    Map<number, KdsKitchenSendBatch>
  >(() => new Map(initialKitchenBatches.map((batch) => [batch.id, batch])));

  const supabaseRef = useRef(createClient());
  const ordersRef = useRef(orders);
  const kitchenBatchesRef = useRef(kitchenBatches);
  const lastSnapshotSyncRef = useRef(Date.now());
  const refreshBoardSnapshotRef =
    useRef<() => Promise<void>>(() => Promise.resolve());
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    kitchenBatchesRef.current = kitchenBatches;
  }, [kitchenBatches]);

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

  const fetchKitchenBatchInfo = useCallback(async (batchId: number) => {
    const supabase = supabaseRef.current;
    const { data } = await supabase
      .from("kitchen_send_batches")
      .select("id, order_id, kitchen_ticket_number, send_seq, kind, created_at")
      .eq("id", batchId)
      .single();

    if (!data) return;

    setKitchenBatches((prev) => {
      const next = new Map(prev);
      next.set(batchId, data as unknown as KdsKitchenSendBatch);
      return next;
    });
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
        "id, station_id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at",
      )
      .eq("branch_id", branchId)
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at");

    if (ticketsError || !freshTickets) return;

    const nextTickets = freshTickets as KdsTicket[];
    const orderIds = [...new Set(nextTickets.map((ticket) => ticket.order_id))];
    const batchIds = [
      ...new Set(
        nextTickets
          .map((ticket) => ticket.kitchen_send_batch_id)
          .filter((id): id is number => id !== null),
      ),
    ];

    if (orderIds.length === 0) {
      setTickets(nextTickets);
      setOrders(new Map());
      setOrderItems(new Map());
      setKitchenBatches(new Map());
      lastSnapshotSyncRef.current = Date.now();
      return;
    }

    const [orderRes, itemsRes, batchRes] = await Promise.all([
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
      batchIds.length > 0
        ? supabase
            .from("kitchen_send_batches")
            .select(
              "id, order_id, kitchen_ticket_number, send_seq, kind, created_at",
            )
            .in("id", batchIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (orderRes.error || itemsRes.error || batchRes.error) return;

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
    setKitchenBatches(
      new Map(
        ((batchRes.data ?? []) as unknown as KdsKitchenSendBatch[]).map(
          (batch) => [batch.id, batch],
        ),
      ),
    );
    lastSnapshotSyncRef.current = Date.now();
  }, [branchId]);

  useEffect(() => {
    refreshBoardSnapshotRef.current = refreshBoardSnapshot;
  }, [refreshBoardSnapshot]);

  const fetchOrderInfoRef = useRef(fetchOrderInfo);
  const fetchKitchenBatchInfoRef = useRef(fetchKitchenBatchInfo);
  const syncOrderItemStatusFromTicketRef = useRef(syncOrderItemStatusFromTicket);
  useEffect(() => {
    fetchOrderInfoRef.current = fetchOrderInfo;
    fetchKitchenBatchInfoRef.current = fetchKitchenBatchInfo;
    syncOrderItemStatusFromTicketRef.current = syncOrderItemStatusFromTicket;
  }, [fetchOrderInfo, fetchKitchenBatchInfo, syncOrderItemStatusFromTicket]);

  useRealtimeChannel(
    (supabase) =>
      supabase
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
              syncOrderItemStatusFromTicketRef.current(newTicket);
              lastSnapshotSyncRef.current = Date.now();

              const orderId = newTicket.order_id;
              if (!ordersRef.current.has(orderId)) {
                void fetchOrderInfoRef.current(orderId);
              }
              const batchId = newTicket.kitchen_send_batch_id;
              if (
                batchId !== null &&
                !kitchenBatchesRef.current.has(batchId)
              ) {
                void fetchKitchenBatchInfoRef.current(batchId);
              }
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as KdsTicket;
              setTickets((prev) =>
                prev.map((t) => (t.id === updated.id ? updated : t)),
              );
              syncOrderItemStatusFromTicketRef.current(updated);
              lastSnapshotSyncRef.current = Date.now();
              const batchId = updated.kitchen_send_batch_id;
              if (
                batchId !== null &&
                !kitchenBatchesRef.current.has(batchId)
              ) {
                void fetchKitchenBatchInfoRef.current(batchId);
              }
            } else if (payload.eventType === "DELETE") {
              const deleted = payload.old as { id: number };
              setTickets((prev) => prev.filter((t) => t.id !== deleted.id));
              lastSnapshotSyncRef.current = Date.now();
            }
          },
        )
        // KDS-TRANSFER-TABLE-SYNC: orders UPDATE filtered to this branch.
        // We only re-fetch when table_id actually changed and we have the
        // order cached — most order UPDATEs (status, totals, payment) are
        // no-ops for KDS rendering. orders is in supabase_realtime with
        // REPLICA IDENTITY FULL (migration 20260425024802) so payload.old
        // carries the prior table_id.
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `branch_id=eq.${String(branchId)}`,
          },
          (payload) => {
            const oldRow = payload.old as { id?: number; table_id?: number | null };
            const newRow = payload.new as { id?: number; table_id?: number | null };
            const orderId = newRow.id;
            if (orderId === undefined) return;
            if (!ordersRef.current.has(orderId)) return;
            if (oldRow.table_id === newRow.table_id) return;
            void fetchOrderInfoRef.current(orderId);
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
        }),
    [branchId],
  );

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

  // Resume catch-up: a chef tablet briefly backgrounded (e.g. swap to
  // recipe lookup) needs an immediate snapshot on return so a missed
  // ticket from the disconnect window doesn't sit silent until the next
  // 12s poll tick. Mirrors use-notifications.ts:131-139.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshBoardSnapshotRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return {
    tickets,
    orders,
    orderItems,
    kitchenBatches,
    setTickets,
    refreshBoardSnapshot,
  };
}
