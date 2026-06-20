import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { loadAuthState } from "@/_lib/auth";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import { currentUserHasPermission } from "@/_lib/permissions";
import { KdsBoard } from "./kds-board";
import { fetchBranchMenuDailyLimits } from "../menu-limits/actions";
import {
  dedupeRowsById,
  fetchChunkedRows,
  fetchPagedRows,
  sortKdsTicketsNewestFirst,
  uniqueNumbers,
} from "./lib/query-helpers";
import type {
  KdsStation,
  KdsTicket,
  KdsOrderInfo,
  KdsOrderItem,
  KdsKitchenSendBatch,
  KdsMenuLimitRow,
} from "./types";

const KDS_ORDER_SELECT_WITH_PRIORITY =
  "id, order_number, order_type, table_id, is_priority, note, created_at, tables(number)";
const KDS_ORDER_SELECT_BASE =
  "id, order_number, order_type, table_id, note, created_at, tables(number)";
const KDS_ORDER_ITEM_SELECT_WITH_PRIORITY =
  "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, is_priority, note, modifiers, sides, menu_items(menu_categories(name,type))";
const KDS_ORDER_ITEM_SELECT_BASE =
  "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides, menu_items(menu_categories(name,type))";
const KDS_TICKET_SELECT =
  "id, station_id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";
const KDS_ACTIVE_STATUSES = ["pending", "preparing"] as const;
const KDS_VISIBLE_STATUSES = ["pending", "preparing", "ready"] as const;

type KdsSupabase = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

type KdsQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

function isMissingPriorityColumn(error: { message?: string } | null): boolean {
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
  }));
}

function normalizeKdsOrderItems(
  rows: unknown[] | null | undefined,
): KdsOrderItem[] {
  return (
    (rows ?? []) as Array<
      Omit<KdsOrderItem, "is_priority" | "category_name" | "category_type"> & {
        is_priority?: boolean | null;
        menu_items?: {
          menu_categories?: {
            name?: string | null;
            type?: string | null;
          } | null;
        } | null;
      }
    >
  ).map((row) => {
    const { menu_items: menuItem, is_priority, ...item } = row;
    const category = menuItem?.menu_categories ?? null;
    return {
      ...item,
      category_name: category?.name ?? null,
      category_type: category?.type ?? null,
      is_priority: is_priority === true,
    };
  });
}

async function fetchKdsOrdersByIds(args: {
  supabase: KdsSupabase;
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

async function fetchKdsOrderItemsByIds(args: {
  supabase: KdsSupabase;
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
  supabase: KdsSupabase;
  batchIds: number[];
}): Promise<{ data: KdsKitchenSendBatch[] | null; error: unknown | null }> {
  const { supabase, batchIds } = args;
  const result = await fetchChunkedRows<KdsKitchenSendBatch>(
    batchIds,
    async (ids) => {
      const { data, error } = await supabase
        .from("kitchen_send_batches")
        .select(
          "id, order_id, kitchen_ticket_number, send_seq, kind, created_at",
        )
        .in("id", ids);

      return {
        data: (data ?? null) as KdsKitchenSendBatch[] | null,
        error,
      };
    },
  );

  return result;
}

async function fetchVisibleKdsTickets(args: {
  supabase: KdsSupabase;
  branchId: number;
  todayStartIso: string;
}): Promise<{ tickets: KdsTicket[]; error: boolean }> {
  const { supabase, branchId, todayStartIso } = args;
  const activeTicketsResult = await fetchPagedRows<KdsTicket>(
    async (from, to) => {
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
    },
  );

  if (activeTicketsResult.error) {
    return { tickets: [], error: true };
  }

  const activeTickets = activeTicketsResult.data ?? [];
  const activeBatchIds = uniqueNumbers(
    activeTickets
      .map((ticket) => ticket.kitchen_send_batch_id)
      .filter((id): id is number => id !== null),
  );
  const activeUngroupedOrderIds = uniqueNumbers(
    activeTickets
      .filter((ticket) => ticket.kitchen_send_batch_id === null)
      .map((ticket) => ticket.order_id),
  );

  const chunks: KdsTicket[][] = [];

  if (activeBatchIds.length > 0) {
    const batchTicketsResult = await fetchChunkedRows<KdsTicket>(
      activeBatchIds,
      (batchIds) =>
        fetchPagedRows<KdsTicket>(async (from, to) => {
          const { data, error } = await supabase
            .from("kds_tickets")
            .select(KDS_TICKET_SELECT)
            .eq("branch_id", branchId)
            .in("status", KDS_VISIBLE_STATUSES)
            .gte("created_at", todayStartIso)
            .in("kitchen_send_batch_id", batchIds)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);

          return { data: (data ?? null) as KdsTicket[] | null, error };
        }),
    );

    if (batchTicketsResult.error) return { tickets: [], error: true };
    chunks.push(batchTicketsResult.data ?? []);
  }

  if (activeUngroupedOrderIds.length > 0) {
    const ungroupedTicketsResult = await fetchChunkedRows<KdsTicket>(
      activeUngroupedOrderIds,
      (orderIds) =>
        fetchPagedRows<KdsTicket>(async (from, to) => {
          const { data, error } = await supabase
            .from("kds_tickets")
            .select(KDS_TICKET_SELECT)
            .eq("branch_id", branchId)
            .in("status", KDS_VISIBLE_STATUSES)
            .gte("created_at", todayStartIso)
            .is("kitchen_send_batch_id", null)
            .in("order_id", orderIds)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);

          return { data: (data ?? null) as KdsTicket[] | null, error };
        }),
    );

    if (ungroupedTicketsResult.error) return { tickets: [], error: true };
    chunks.push(ungroupedTicketsResult.data ?? []);
  }

  return {
    tickets: sortKdsTicketsNewestFirst(dedupeRowsById(chunks.flat())),
    error: false,
  };
}

export default async function KdsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { supabase } = await loadAuthState();

  const { branchId } = await params;
  const branchIdNum = Number(branchId);
  const { startIso: todayStartIso } = getVNDayUtcRange(getVNDateString());

  const { data: rawStations, error: stationsError } = await supabase
    .from("kds_stations")
    .select("id, name, position, is_active")
    .eq("branch_id", branchIdNum)
    .eq("is_active", true)
    .order("position");

  if (stationsError) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <IconAlertCircle />
          <AlertDescription>
            Không tải được danh sách trạm bếp. Vui lòng tải lại trang.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const ticketResult = await fetchVisibleKdsTickets({
    supabase,
    branchId: branchIdNum,
    todayStartIso,
  });

  if (ticketResult.error) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <IconAlertCircle />
          <AlertDescription>
            Không tải được món chờ chế biến. Vui lòng tải lại trang.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const stations = (rawStations ?? []) as KdsStation[];
  const tickets = ticketResult.tickets;

  // Fallback station detection: a station with zero category mappings receives
  // unrouted items. Surface these as menu categories missing station config.
  let fallbackStationIds: number[] = [];
  if (stations.length > 0) {
    const { data: mappingRows } = await supabase
      .from("kds_station_categories")
      .select("station_id")
      .in(
        "station_id",
        stations.map((s) => s.id),
      );
    const mapped = new Set(
      ((mappingRows ?? []) as { station_id: number }[]).map(
        (r) => r.station_id,
      ),
    );
    fallbackStationIds = stations
      .filter((s) => !mapped.has(s.id))
      .map((s) => s.id);
  }

  const [canMarkReady, canRecall] = await Promise.all([
    currentUserHasPermission(branchIdNum, "kds:mark_ready"),
    currentUserHasPermission(branchIdNum, "kds:recall"),
  ]);

  const orderIds = uniqueNumbers(tickets.map((t) => t.order_id));
  const orderItemIds = uniqueNumbers(tickets.map((t) => t.order_item_id));

  let orders: KdsOrderInfo[] = [];
  let orderItems: KdsOrderItem[] = [];
  let kitchenBatches: KdsKitchenSendBatch[] = [];

  if (orderIds.length > 0) {
    const [ordersRes, itemsRes] = await Promise.all([
      fetchKdsOrdersByIds({
        supabase,
        branchId: branchIdNum,
        orderIds,
      }),
      fetchKdsOrderItemsByIds({ supabase, orderItemIds }),
    ]);

    if (ordersRes.error || itemsRes.error) {
      return (
        <div className="flex h-dvh items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <IconAlertCircle />
            <AlertDescription>
              Không tải được chi tiết món chờ chế biến. Vui lòng tải lại trang.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    orders = ordersRes.data ?? [];
    orderItems = itemsRes.data ?? [];
  }

  const batchIds = uniqueNumbers(
    tickets
      .map((ticket) => ticket.kitchen_send_batch_id)
      .filter((id): id is number => id !== null),
  );

  if (batchIds.length > 0) {
    const batchRes = await fetchKdsKitchenBatchesByIds({
      supabase,
      batchIds,
    });
    if (batchRes.error) {
      return (
        <div className="flex h-dvh items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <IconAlertCircle />
            <AlertDescription>
              Không tải được số phiếu bếp. Vui lòng tải lại trang.
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    kitchenBatches = batchRes.data ?? [];
  }

  const limitResult = await fetchBranchMenuDailyLimits(branchIdNum);
  const menuLimits: KdsMenuLimitRow[] =
    limitResult.success && limitResult.data
      ? (limitResult.data as KdsMenuLimitRow[])
      : [];

  return (
    <KdsBoard
      branchId={branchIdNum}
      initialNowMs={Date.now()}
      stations={stations}
      fallbackStationIds={fallbackStationIds}
      canMarkReady={canMarkReady}
      canRecall={canRecall}
      initialTickets={tickets}
      initialOrders={orders}
      initialOrderItems={orderItems}
      initialKitchenBatches={kitchenBatches}
      initialMenuLimits={menuLimits}
    />
  );
}
