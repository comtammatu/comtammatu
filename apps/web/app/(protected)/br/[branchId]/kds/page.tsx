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

  const { data: rawTickets, error: ticketsError } = await supabase
    .from("kds_tickets")
    .select(
      "id, station_id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at",
    )
    .eq("branch_id", branchIdNum)
    .in("status", ["pending", "preparing", "ready"])
    .gte("created_at", todayStartIso)
    .order("created_at", { ascending: false });

  if (ticketsError) {
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
  const tickets = (rawTickets ?? []) as KdsTicket[];

  // Fallback station detection: a station with zero category mappings receives
  // unrouted items. Surface these on the board as "Chưa phân trạm".
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
    const [ordersRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, order_type, table_id, created_at, tables(number)",
        )
        .in("id", orderIds),
      supabase
        .from("order_items")
        .select(
          "id, order_id, menu_item_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides",
        )
        .in("id", orderItemIds),
    ]);

    orders = (ordersRes.data ?? []) as unknown as KdsOrderInfo[];
    orderItems = (itemsRes.data ?? []) as unknown as KdsOrderItem[];
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
