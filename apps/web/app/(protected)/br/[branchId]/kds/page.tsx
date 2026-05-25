import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { loadAuthState } from "@/_lib/auth";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import { currentUserHasPermission } from "@/_lib/permissions";
import { KdsBoard } from "./kds-board";
import { fetchBranchMenuDailyLimits } from "../menu-limits/actions";
import type {
  KdsStation,
  KdsTicket,
  KdsOrderInfo,
  KdsOrderItem,
  KdsKitchenSendBatch,
  KdsMenuLimitRow,
} from "./types";

const KDS_ORDER_SELECT_WITH_PRIORITY =
  "id, order_number, order_type, table_id, is_priority, created_at, tables(number)";
const KDS_ORDER_SELECT_BASE =
  "id, order_number, order_type, table_id, created_at, tables(number)";
const KDS_ORDER_ITEM_SELECT_WITH_PRIORITY =
  "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, is_priority, note, modifiers, sides";
const KDS_ORDER_ITEM_SELECT_BASE =
  "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides";
const KDS_TICKET_SELECT =
  "id, station_id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";
const KDS_ACTIVE_STATUSES = ["pending", "preparing"] as const;
const KDS_VISIBLE_STATUSES = [
  "pending",
  "preparing",
  "ready",
  "cancelled",
] as const;

type KdsQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

function isMissingPriorityColumn(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("is_priority") && message.includes("column");
}

function normalizeKdsOrders(rows: unknown[] | null | undefined): KdsOrderInfo[] {
  return ((rows ?? []) as Array<Omit<KdsOrderInfo, "is_priority"> & {
    is_priority?: boolean | null;
  }>).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
  }));
}

function normalizeKdsOrderItems(
  rows: unknown[] | null | undefined,
): KdsOrderItem[] {
  return ((rows ?? []) as Array<Omit<KdsOrderItem, "is_priority"> & {
    is_priority?: boolean | null;
  }>).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
  }));
}

async function fetchVisibleKdsTickets(args: {
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"];
  branchId: number;
  todayStartIso: string;
}): Promise<{ tickets: KdsTicket[]; error: boolean }> {
  const { supabase, branchId, todayStartIso } = args;
  const { data: rawActiveTickets, error: activeTicketsError } = await supabase
    .from("kds_tickets")
    .select(KDS_TICKET_SELECT)
    .eq("branch_id", branchId)
    .in("status", KDS_ACTIVE_STATUSES)
    .gte("created_at", todayStartIso)
    .order("created_at", { ascending: false });

  if (activeTicketsError) {
    return { tickets: [], error: true };
  }

  const activeTickets = (rawActiveTickets ?? []) as KdsTicket[];
  const activeBatchIds = [
    ...new Set(
      activeTickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    ),
  ];
  const activeUngroupedOrderIds = [
    ...new Set(
      activeTickets
        .filter((ticket) => ticket.kitchen_send_batch_id === null)
        .map((ticket) => ticket.order_id),
    ),
  ];

  const chunks: KdsTicket[][] = [];

  if (activeBatchIds.length > 0) {
    const { data, error } = await supabase
      .from("kds_tickets")
      .select(KDS_TICKET_SELECT)
      .eq("branch_id", branchId)
      .in("status", KDS_VISIBLE_STATUSES)
      .gte("created_at", todayStartIso)
      .in("kitchen_send_batch_id", activeBatchIds)
      .order("created_at", { ascending: false });

    if (error) return { tickets: [], error: true };
    chunks.push((data ?? []) as KdsTicket[]);
  }

  if (activeUngroupedOrderIds.length > 0) {
    const { data, error } = await supabase
      .from("kds_tickets")
      .select(KDS_TICKET_SELECT)
      .eq("branch_id", branchId)
      .in("status", KDS_VISIBLE_STATUSES)
      .gte("created_at", todayStartIso)
      .is("kitchen_send_batch_id", null)
      .in("order_id", activeUngroupedOrderIds)
      .order("created_at", { ascending: false });

    if (error) return { tickets: [], error: true };
    chunks.push((data ?? []) as KdsTicket[]);
  }

  const byId = new Map<number, KdsTicket>();
  for (const ticket of chunks.flat()) {
    byId.set(ticket.id, ticket);
  }

  return {
    tickets: [...byId.values()].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
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
      <div className="flex h-dvh items-center justify-center p-6">
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
      <div className="flex h-dvh items-center justify-center p-6">
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

  const orderIds = [...new Set(tickets.map((t) => t.order_id))];
  const orderItemIds = [...new Set(tickets.map((t) => t.order_item_id))];

  let orders: KdsOrderInfo[] = [];
  let orderItems: KdsOrderItem[] = [];
  let kitchenBatches: KdsKitchenSendBatch[] = [];

  if (orderIds.length > 0) {
    let [ordersRes, itemsRes]: [KdsQueryResult, KdsQueryResult] =
      await Promise.all([
        supabase
          .from("orders")
          .select(KDS_ORDER_SELECT_WITH_PRIORITY)
          .in("id", orderIds),
        supabase
          .from("order_items")
          .select(KDS_ORDER_ITEM_SELECT_WITH_PRIORITY)
          .in("id", orderItemIds),
      ]);

    if (isMissingPriorityColumn(ordersRes.error)) {
      ordersRes = await supabase
        .from("orders")
        .select(KDS_ORDER_SELECT_BASE)
        .in("id", orderIds);
    }

    if (isMissingPriorityColumn(itemsRes.error)) {
      itemsRes = await supabase
        .from("order_items")
        .select(KDS_ORDER_ITEM_SELECT_BASE)
        .in("id", orderItemIds);
    }

    orders = normalizeKdsOrders(ordersRes.data as unknown[] | null);
    orderItems = normalizeKdsOrderItems(itemsRes.data as unknown[] | null);
  }

  const batchIds = [
    ...new Set(
      tickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    ),
  ];

  if (batchIds.length > 0) {
    const { data: rawBatches } = await supabase
      .from("kitchen_send_batches")
      .select("id, order_id, kitchen_ticket_number, send_seq, kind, created_at")
      .in("id", batchIds);
    kitchenBatches = (rawBatches ?? []) as unknown as KdsKitchenSendBatch[];
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
