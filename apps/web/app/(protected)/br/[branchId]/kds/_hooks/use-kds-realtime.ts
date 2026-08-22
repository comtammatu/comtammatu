"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import {
  makeKeyedRealtimeBatcher,
  makeRealtimeCoalescer,
} from "@/_utils/realtime-scheduler";
import {
  dedupeRowsById,
  fetchChunkedRows,
  fetchPagedRows,
  sortKdsTicketsNewestFirst,
  uniqueNumbers,
} from "../_lib/query-helpers";
import type {
  KdsKitchenSendBatch,
  KdsOrderInfo,
  KdsOrderItem,
  KdsTicket,
} from "../types";

const POLL_INTERVAL_MS = 25_000;
const POLL_STALE_MS = 25_000;
const KDS_ORDER_SELECT_WITH_PRIORITY =
  "id, order_number, order_type, table_id, is_priority, note, created_at, delivery_platform, external_order_ref, tables(number)";
const KDS_ORDER_SELECT_BASE =
  "id, order_number, order_type, table_id, note, created_at, delivery_platform, external_order_ref, tables(number)";
const KDS_ORDER_ITEM_SELECT_WITH_PRIORITY =
  "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, is_priority, note, modifiers, sides, category_type_snapshot, menu_items(menu_categories(name,type))";
const KDS_ORDER_ITEM_SELECT_BASE =
  "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides, category_type_snapshot, menu_items(menu_categories(name,type))";
const KDS_TICKET_SELECT =
  "id, station_id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";
const KDS_ACTIVE_STATUSES = ["pending", "preparing"];
const KDS_VISIBLE_STATUSES = ["pending", "preparing", "ready"];
const KDS_VISIBLE_STATUS_SET = new Set<string>(KDS_VISIBLE_STATUSES);
const EMPTY_INSERTED_TICKET_IDS: readonly number[] = [];

type KdsQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};
type KdsSupabaseClient = ReturnType<typeof createClient>;

function isVisibleKdsTicket(ticket: KdsTicket): boolean {
  return KDS_VISIBLE_STATUS_SET.has(ticket.status);
}

function isMissingPriorityColumn(
  error: { message?: string } | null | undefined,
): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("is_priority") && message.includes("column");
}

function normalizeKdsOrders(
  rows: unknown[] | null | undefined,
): KdsOrderInfo[] {
  return (
    (rows ?? []) as Array<
      Omit<KdsOrderInfo, "is_priority"> & {
        is_priority?: boolean | null;
      }
    >
  ).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
    delivery_platform: row.delivery_platform ?? null,
    external_order_ref: row.external_order_ref ?? null,
  }));
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

type KdsMenuCategoryEmbed = {
  name?: string | null;
  type?: string | null;
};

type KdsMenuItemEmbed = {
  menu_categories?: KdsMenuCategoryEmbed | KdsMenuCategoryEmbed[] | null;
};

function normalizeKdsOrderItems(
  rows: unknown[] | null | undefined,
): KdsOrderItem[] {
  return (
    (rows ?? []) as Array<
      Omit<KdsOrderItem, "is_priority" | "category_name" | "category_type"> & {
        is_priority?: boolean | null;
        category_type_snapshot?: string | null;
        menu_items?: KdsMenuItemEmbed | KdsMenuItemEmbed[] | null;
      }
    >
  ).map((row) => {
    const {
      menu_items: menuItemRaw,
      is_priority,
      category_type_snapshot,
      ...item
    } = row;
    const menuItem = firstRelation(menuItemRaw);
    const category = firstRelation(menuItem?.menu_categories);
    return {
      ...item,
      category_name: category?.name ?? null,
      category_type: category_type_snapshot ?? category?.type ?? null,
      is_priority: is_priority === true,
    };
  });
}

async function fetchKdsOrdersByIds(args: {
  supabase: KdsSupabaseClient;
  branchId: number;
  orderIds: number[];
}): Promise<{ data: KdsOrderInfo[] | null; error: unknown | null }> {
  const { supabase, branchId, orderIds } = args;
  const result = await fetchChunkedRows<unknown>(orderIds, async (ids) => {
    let orderRes: KdsQueryResult = await supabase
      .from("orders")
      .select(KDS_ORDER_SELECT_WITH_PRIORITY)
      .in("id", ids)
      .eq("branch_id", branchId);

    if (isMissingPriorityColumn(orderRes.error)) {
      orderRes = await supabase
        .from("orders")
        .select(KDS_ORDER_SELECT_BASE)
        .in("id", ids)
        .eq("branch_id", branchId);
    }

    return orderRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizeKdsOrders(result.data), error: null };
}

async function fetchKdsOrderItemsByOrderIds(args: {
  supabase: KdsSupabaseClient;
  orderIds: number[];
}): Promise<{ data: KdsOrderItem[] | null; error: unknown | null }> {
  const { supabase, orderIds } = args;
  const result = await fetchChunkedRows<unknown>(orderIds, async (ids) => {
    let itemsRes: KdsQueryResult = await supabase
      .from("order_items")
      .select(KDS_ORDER_ITEM_SELECT_WITH_PRIORITY)
      .in("order_id", ids);

    if (isMissingPriorityColumn(itemsRes.error)) {
      itemsRes = await supabase
        .from("order_items")
        .select(KDS_ORDER_ITEM_SELECT_BASE)
        .in("order_id", ids);
    }

    return itemsRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizeKdsOrderItems(result.data), error: null };
}

async function fetchKdsOrderItemsByIds(args: {
  supabase: KdsSupabaseClient;
  orderItemIds: number[];
}): Promise<{ data: KdsOrderItem[] | null; error: unknown | null }> {
  const { supabase, orderItemIds } = args;
  const result = await fetchChunkedRows<unknown>(orderItemIds, async (ids) => {
    let itemsRes: KdsQueryResult = await supabase
      .from("order_items")
      .select(KDS_ORDER_ITEM_SELECT_WITH_PRIORITY)
      .in("id", ids);

    if (isMissingPriorityColumn(itemsRes.error)) {
      itemsRes = await supabase
        .from("order_items")
        .select(KDS_ORDER_ITEM_SELECT_BASE)
        .in("id", ids);
    }

    return itemsRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizeKdsOrderItems(result.data), error: null };
}

async function fetchKdsKitchenBatchesByIds(args: {
  supabase: KdsSupabaseClient;
  batchIds: number[];
}): Promise<{ data: KdsKitchenSendBatch[] | null; error: unknown | null }> {
  const { supabase, batchIds } = args;
  return fetchChunkedRows<KdsKitchenSendBatch>(batchIds, async (ids) => {
    const { data, error } = await supabase
      .from("kitchen_send_batches")
      .select("id, order_id, kitchen_ticket_number, send_seq, kind, created_at")
      .in("id", ids);

    return {
      data: (data ?? null) as KdsKitchenSendBatch[] | null,
      error,
    };
  });
}

async function fetchActiveKdsTickets(args: {
  supabase: KdsSupabaseClient;
  branchId: number;
  todayStartIso: string;
}): Promise<{ data: KdsTicket[] | null; error: unknown | null }> {
  const { supabase, branchId, todayStartIso } = args;
  return fetchPagedRows<KdsTicket>(async (from, to) => {
    const { data, error } = await supabase
      .from("kds_tickets")
      .select(KDS_TICKET_SELECT)
      .eq("branch_id", branchId)
      .in("status", KDS_ACTIVE_STATUSES)
      .gte("created_at", todayStartIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    return { data: (data ?? null) as KdsTicket[] | null, error };
  });
}

async function fetchVisibleTicketsByBatchIds(args: {
  supabase: KdsSupabaseClient;
  branchId: number;
  todayStartIso: string;
  batchIds: number[];
}): Promise<{ data: KdsTicket[] | null; error: unknown | null }> {
  const { supabase, branchId, todayStartIso, batchIds } = args;
  return fetchChunkedRows<KdsTicket>(batchIds, (ids) =>
    fetchPagedRows<KdsTicket>(async (from, to) => {
      const { data, error } = await supabase
        .from("kds_tickets")
        .select(KDS_TICKET_SELECT)
        .eq("branch_id", branchId)
        .in("status", KDS_VISIBLE_STATUSES)
        .gte("created_at", todayStartIso)
        .in("kitchen_send_batch_id", ids)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      return { data: (data ?? null) as KdsTicket[] | null, error };
    }),
  );
}

async function fetchVisibleUngroupedTicketsByOrderIds(args: {
  supabase: KdsSupabaseClient;
  branchId: number;
  todayStartIso: string;
  orderIds: number[];
}): Promise<{ data: KdsTicket[] | null; error: unknown | null }> {
  const { supabase, branchId, todayStartIso, orderIds } = args;
  return fetchChunkedRows<KdsTicket>(orderIds, (ids) =>
    fetchPagedRows<KdsTicket>(async (from, to) => {
      const { data, error } = await supabase
        .from("kds_tickets")
        .select(KDS_TICKET_SELECT)
        .eq("branch_id", branchId)
        .in("status", KDS_VISIBLE_STATUSES)
        .gte("created_at", todayStartIso)
        .is("kitchen_send_batch_id", null)
        .in("order_id", ids)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      return { data: (data ?? null) as KdsTicket[] | null, error };
    }),
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

function getVisibleTicketScopes(activeTickets: KdsTicket[]): {
  batchIds: number[];
  ungroupedOrderIds: number[];
} {
  return {
    batchIds: [
      ...new Set(
        activeTickets
          .map((ticket) => ticket.kitchen_send_batch_id)
          .filter((id): id is number => id !== null),
      ),
    ],
    ungroupedOrderIds: [
      ...new Set(
        activeTickets
          .filter((ticket) => ticket.kitchen_send_batch_id === null)
          .map((ticket) => ticket.order_id),
      ),
    ],
  };
}

export interface UseKdsRealtimeArgs {
  branchId: number;
  initialTickets: KdsTicket[];
  initialOrders: KdsOrderInfo[];
  initialOrderItems: KdsOrderItem[];
  initialKitchenBatches: KdsKitchenSendBatch[];
  /**
   * Whether the initial board state was seeded from RSC. When false (cold-load
   * streaming renders the shell first and fetches the snapshot on the client),
   * the first SUBSCRIBED triggers a snapshot fetch instead of being skipped.
   */
  seeded?: boolean;
}

export interface KdsRealtimeState {
  tickets: KdsTicket[];
  orders: Map<number, KdsOrderInfo>;
  orderItems: Map<number, KdsOrderItem[]>;
  kitchenBatches: Map<number, KdsKitchenSendBatch>;
  setTickets: React.Dispatch<React.SetStateAction<KdsTicket[]>>;
  refreshBoardSnapshot: () => Promise<void>;
  /**
   * Drains the ids of tickets that arrived via a realtime INSERT since the
   * previous call. This is the only provable "genuinely new ticket" source —
   * snapshot refresh / reconnect / poll / visibility refetch replace state
   * wholesale and never fill this buffer, so consumers can distinguish a real
   * new ticket from a refetch that merely re-lists it.
   */
  consumeRealtimeInsertedTicketIds: () => readonly number[];
}

export function useKdsRealtime({
  branchId,
  initialTickets,
  initialOrders,
  initialOrderItems,
  initialKitchenBatches,
  seeded = true,
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
  const branchIdRef = useRef(branchId);
  const ordersRef = useRef(orders);
  const kitchenBatchesRef = useRef(kitchenBatches);
  const lastSnapshotSyncRef = useRef(Date.now());
  const initialSubscribeSeenRef = useRef(false);
  const seededRef = useRef(seeded);
  // Buffer of ticket ids delivered by realtime INSERT events only. Filled in
  // the INSERT branch below and drained by consumeRealtimeInsertedTicketIds.
  const insertedTicketIdsRef = useRef<number[]>([]);

  useEffect(() => {
    branchIdRef.current = branchId;
  }, [branchId]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    kitchenBatchesRef.current = kitchenBatches;
  }, [kitchenBatches]);

  const fetchOrderInfoBatch = useCallback(async (orderIds: number[]) => {
    const ids = uniqueNumbers(orderIds);
    if (ids.length === 0) return;

    const supabase = supabaseRef.current;
    const targetBranchId = branchIdRef.current;

    const [orderRes, itemsRes] = await Promise.all([
      fetchKdsOrdersByIds({
        supabase,
        branchId: targetBranchId,
        orderIds: ids,
      }),
      fetchKdsOrderItemsByOrderIds({ supabase, orderIds: ids }),
    ]);

    if (branchIdRef.current !== targetBranchId) return;

    if (orderRes.data) {
      setOrders((prev) => {
        const next = new Map(prev);
        for (const order of orderRes.data ?? []) {
          next.set(order.id, order);
        }
        return next;
      });
    }

    if (itemsRes.data) {
      const groupedItems = buildOrderItemMap(itemsRes.data);
      setOrderItems((prev) => {
        const next = new Map(prev);
        for (const orderId of ids) {
          next.set(orderId, groupedItems.get(orderId) ?? []);
        }
        return next;
      });
    }
  }, []);

  const scheduleOrderInfoRefresh = useMemo(
    () =>
      makeKeyedRealtimeBatcher(fetchOrderInfoBatch, undefined, {
        metricName: "kds.order-info.refresh",
      }),
    [fetchOrderInfoBatch],
  );

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
    const targetBranchId = branchId;
    const { startIso: todayStartIso } = getVNDayUtcRange(getVNDateString());

    const activeTicketsResult = await fetchActiveKdsTickets({
      supabase,
      branchId: targetBranchId,
      todayStartIso,
    });

    if (activeTicketsResult.error || !activeTicketsResult.data) return;
    if (branchIdRef.current !== targetBranchId) return;

    const activeTickets = activeTicketsResult.data;
    const { batchIds: activeBatchIds, ungroupedOrderIds } =
      getVisibleTicketScopes(activeTickets);

    const [batchTicketsResult, ungroupedTicketsResult] = await Promise.all([
      fetchVisibleTicketsByBatchIds({
        supabase,
        branchId: targetBranchId,
        todayStartIso,
        batchIds: activeBatchIds,
      }),
      fetchVisibleUngroupedTicketsByOrderIds({
        supabase,
        branchId: targetBranchId,
        todayStartIso,
        orderIds: ungroupedOrderIds,
      }),
    ]);

    if (batchTicketsResult.error || ungroupedTicketsResult.error) return;

    const nextTickets = sortKdsTicketsNewestFirst(
      dedupeRowsById([
        ...(batchTicketsResult.data ?? []),
        ...(ungroupedTicketsResult.data ?? []),
      ]),
    );
    const orderIds = uniqueNumbers(
      nextTickets.map((ticket) => ticket.order_id),
    );
    const orderItemIds = uniqueNumbers(
      nextTickets.map((ticket) => ticket.order_item_id),
    );
    const batchIds = uniqueNumbers(
      nextTickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    );

    if (orderIds.length === 0) {
      setTickets(nextTickets);
      setOrders(new Map());
      setOrderItems(new Map());
      setKitchenBatches(new Map());
      lastSnapshotSyncRef.current = Date.now();
      return;
    }

    const [snapshotOrdersRes, snapshotItemsRes, batchRes] = await Promise.all([
      fetchKdsOrdersByIds({
        supabase,
        branchId: targetBranchId,
        orderIds,
      }),
      fetchKdsOrderItemsByIds({ supabase, orderItemIds }),
      fetchKdsKitchenBatchesByIds({ supabase, batchIds }),
    ]);

    if (
      snapshotOrdersRes.error ||
      snapshotItemsRes.error ||
      batchRes.error ||
      branchIdRef.current !== targetBranchId
    ) {
      return;
    }

    setTickets(nextTickets);
    setOrders(
      new Map(
        normalizeKdsOrders(snapshotOrdersRes.data).map((order) => [
          order.id,
          order,
        ]),
      ),
    );
    setOrderItems(buildOrderItemMap(snapshotItemsRes.data ?? []));
    setKitchenBatches(
      new Map((batchRes.data ?? []).map((batch) => [batch.id, batch])),
    );
    lastSnapshotSyncRef.current = Date.now();
  }, [branchId]);

  const scheduleBoardSnapshotRefresh = useMemo(
    () =>
      makeRealtimeCoalescer(refreshBoardSnapshot, undefined, {
        metricName: "kds.board-snapshot.refresh",
      }),
    [refreshBoardSnapshot],
  );

  const scheduleOrderInfoRefreshRef = useRef(scheduleOrderInfoRefresh);
  const scheduleBoardSnapshotRefreshRef = useRef(scheduleBoardSnapshotRefresh);
  const fetchKitchenBatchInfoRef = useRef(fetchKitchenBatchInfo);
  const syncOrderItemStatusFromTicketRef = useRef(
    syncOrderItemStatusFromTicket,
  );
  useEffect(() => {
    scheduleOrderInfoRefreshRef.current = scheduleOrderInfoRefresh;
    scheduleBoardSnapshotRefreshRef.current = scheduleBoardSnapshotRefresh;
    fetchKitchenBatchInfoRef.current = fetchKitchenBatchInfo;
    syncOrderItemStatusFromTicketRef.current = syncOrderItemStatusFromTicket;
  }, [
    fetchKitchenBatchInfo,
    scheduleBoardSnapshotRefresh,
    scheduleOrderInfoRefresh,
    syncOrderItemStatusFromTicket,
  ]);

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
              if (!isVisibleKdsTicket(newTicket)) return;
              // Provable new-ticket source: only realtime INSERT records the id
              // here. UPDATE / DELETE / snapshot refresh below never do.
              insertedTicketIdsRef.current.push(newTicket.id);
              setTickets((prev) => {
                if (prev.some((t) => t.id === newTicket.id)) return prev;
                return [...prev, newTicket];
              });
              syncOrderItemStatusFromTicketRef.current(newTicket);
              lastSnapshotSyncRef.current = Date.now();

              const orderId = newTicket.order_id;
              scheduleOrderInfoRefreshRef.current(orderId);
              const batchId = newTicket.kitchen_send_batch_id;
              if (batchId !== null && !kitchenBatchesRef.current.has(batchId)) {
                void fetchKitchenBatchInfoRef.current(batchId);
              }
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as KdsTicket;
              setTickets((prev) =>
                isVisibleKdsTicket(updated)
                  ? prev.map((t) => (t.id === updated.id ? updated : t))
                  : prev.filter((t) => t.id !== updated.id),
              );
              syncOrderItemStatusFromTicketRef.current(updated);
              scheduleOrderInfoRefreshRef.current(updated.order_id);
              lastSnapshotSyncRef.current = Date.now();
              const batchId = updated.kitchen_send_batch_id;
              if (batchId !== null && !kitchenBatchesRef.current.has(batchId)) {
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
            const oldRow = payload.old as {
              id?: number;
              table_id?: number | null;
              note?: string | null;
            };
            const newRow = payload.new as {
              id?: number;
              table_id?: number | null;
              note?: string | null;
            };
            const orderId = newRow.id;
            if (orderId === undefined) return;
            if (!ordersRef.current.has(orderId)) return;
            if (
              oldRow.table_id === newRow.table_id &&
              oldRow.note === newRow.note &&
              (payload.old as { is_priority?: boolean }).is_priority ===
                (payload.new as { is_priority?: boolean }).is_priority
            ) {
              return;
            }
            scheduleOrderInfoRefreshRef.current(orderId);
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          // Skip the FIRST SUBSCRIBED — board state is already seeded from
          // RSC props (initialTickets/initialOrders/initialOrderItems).
          // When seeded is false (cold-load shell rendered first, snapshot
          // fetched on the client), the first SUBSCRIBED must fetch instead of
          // skip so the empty shell hydrates. Every SUBSCRIBED after that is a
          // genuine reconnect: refetch a fresh snapshot so we don't carry stale
          // state from events that fired during the disconnect window.
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            if (!seededRef.current) {
              scheduleBoardSnapshotRefreshRef.current();
            }
            return;
          }
          scheduleBoardSnapshotRefreshRef.current();
        }),
    [branchId],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const staleMs = Date.now() - lastSnapshotSyncRef.current;
      if (staleMs < POLL_STALE_MS) return;
      scheduleBoardSnapshotRefreshRef.current();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Resume catch-up: a chef tablet briefly backgrounded (e.g. swap to
  // recipe lookup) needs an immediate snapshot on return so a missed
  // ticket from the disconnect window doesn't sit silent until the next
  // 12s poll tick. Mirrors use-notifications.ts:131-139.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleBoardSnapshotRefreshRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const consumeRealtimeInsertedTicketIds = useCallback((): readonly number[] => {
    const ids = insertedTicketIdsRef.current;
    if (ids.length === 0) return EMPTY_INSERTED_TICKET_IDS;
    insertedTicketIdsRef.current = [];
    return ids;
  }, []);

  return {
    tickets,
    orders,
    orderItems,
    kitchenBatches,
    setTickets,
    refreshBoardSnapshot,
    consumeRealtimeInsertedTicketIds,
  };
}
