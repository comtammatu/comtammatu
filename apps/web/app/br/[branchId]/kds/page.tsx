import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { KdsBoard } from "./kds-board";
import type {
  KdsStation,
  KdsTicket,
  KdsOrderInfo,
  KdsOrderItem,
  KdsKitchenSendBatch,
} from "./types";

const KDS_TICKET_SELECT =
  "id, station_id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";

export default async function KdsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { supabase } = await loadAuthState();

  const { branchId } = await params;
  const branchIdNum = Number(branchId);

  const stationsPromise = supabase
    .from("kds_stations")
    .select("id, name, position, is_active")
    .eq("branch_id", branchIdNum)
    .eq("is_active", true)
    .order("position");

  const ticketsPromise = supabase
    .from("kds_tickets")
    .select(KDS_TICKET_SELECT)
    .eq("branch_id", branchIdNum)
    .in("status", ["pending", "preparing", "ready"])
    .order("created_at");

  const permissionsPromise = Promise.all([
    currentUserHasPermission(branchIdNum, "kds:mark_ready"),
    currentUserHasPermission(branchIdNum, "kds:recall"),
  ]);

  const [
    { data: rawStations, error: stationsError },
    { data: rawTickets, error: ticketsError },
    [canMarkReady, canRecall],
  ] = await Promise.all([stationsPromise, ticketsPromise, permissionsPromise]);

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

  const orderIds = [...new Set(tickets.map((t) => t.order_id))];
  const batchIds = [
    ...new Set(
      tickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    ),
  ];

  const mappingPromise =
    stations.length > 0
      ? supabase
          .from("kds_station_categories")
          .select("station_id")
          .in(
            "station_id",
            stations.map((s) => s.id),
          )
      : Promise.resolve({ data: [], error: null });

  const ordersPromise =
    orderIds.length > 0
      ? supabase
          .from("orders")
          .select(
            "id, order_number, order_type, table_id, created_at, tables(number)",
          )
          .in("id", orderIds)
      : Promise.resolve({ data: [], error: null });

  const itemsPromise =
    orderIds.length > 0
      ? supabase
          .from("order_items")
          .select(
            "id, order_id, item_name, variant_name, quantity, unit_price, status, note, modifiers, sides",
          )
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null });

  const batchesPromise =
    batchIds.length > 0
      ? supabase
          .from("kitchen_send_batches")
          .select(
            "id, order_id, kitchen_ticket_number, send_seq, kind, created_at",
          )
          .in("id", batchIds)
      : Promise.resolve({ data: [], error: null });

  const [mappingRes, ordersRes, itemsRes, batchRes] = await Promise.all([
    mappingPromise,
    ordersPromise,
    itemsPromise,
    batchesPromise,
  ]);

  const mapped = new Set(
    ((mappingRes.data ?? []) as { station_id: number }[]).map(
      (r) => r.station_id,
    ),
  );
  const fallbackStationIds = stations
    .filter((s) => !mapped.has(s.id))
    .map((s) => s.id);

  const orders = (ordersRes.data ?? []) as unknown as KdsOrderInfo[];
  const orderItems = (itemsRes.data ?? []) as unknown as KdsOrderItem[];
  const kitchenBatches = (batchRes.data ??
    []) as unknown as KdsKitchenSendBatch[];

  return (
    <KdsBoard
      branchId={branchIdNum}
      stations={stations}
      fallbackStationIds={fallbackStationIds}
      canMarkReady={canMarkReady}
      canRecall={canRecall}
      initialNow={Date.now()}
      initialTickets={tickets}
      initialOrders={orders}
      initialOrderItems={orderItems}
      initialKitchenBatches={kitchenBatches}
    />
  );
}
