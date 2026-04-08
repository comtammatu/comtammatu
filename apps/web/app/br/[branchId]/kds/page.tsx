import { Suspense } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { KdsBoard } from "./kds-board";

// KDS tables (kds_stations, kds_tickets) and RPCs (bump_kds_ticket, recall_kds_ticket)
// are not in generated types yet. Remove `as any` casts after `pnpm db:types`.

/* ─── Types shared with client ─── */

export interface KdsStation {
  id: number;
  name: string;
  position: number;
  is_active: boolean;
}

export interface KdsTicket {
  id: number;
  station_id: number;
  order_id: number;
  order_item_id: number;
  status: string;
  bumped_at: string | null;
  created_at: string;
}

export interface KdsOrderInfo {
  id: number;
  order_number: string;
  order_type: string;
  table_id: number | null;
  created_at: string;
  tables: { number: number } | null;
}

export interface KdsOrderItem {
  id: number;
  order_id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  status: string;
}

export default async function KdsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims || !canAccess(claims.user_role, "kds")) {
    redirect("/login");
  }

  const { branchId } = await params;
  const branchIdNum = Number(branchId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kds_stations not in generated types yet
  const sb = supabase as any;

  // Fetch stations for this branch
  const { data: rawStations, error: stationsError } = await sb
    .from("kds_stations")
    .select("id, name, position, is_active")
    .eq("branch_id", branchIdNum)
    .eq("is_active", true)
    .order("position");

  if (stationsError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-lg text-destructive">
          Không thể tải trạm KDS. Vui lòng thử lại.
        </p>
      </div>
    );
  }

  // Fetch active tickets for this branch
  const { data: rawTickets } = await sb
    .from("kds_tickets")
    .select(
      "id, station_id, order_id, order_item_id, status, bumped_at, created_at",
    )
    .eq("branch_id", branchIdNum)
    .in("status", ["pending", "preparing", "ready"])
    .order("created_at");

  const stations = (rawStations ?? []) as KdsStation[];
  const tickets = (rawTickets ?? []) as KdsTicket[];

  // Collect unique order IDs to fetch order info
  const orderIds = [...new Set(tickets.map((t) => t.order_id))];

  let orders: KdsOrderInfo[] = [];
  let orderItems: KdsOrderItem[] = [];

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
          "id, order_id, item_name, variant_name, quantity, unit_price, status",
        )
        .in("order_id", orderIds),
    ]);

    orders = (ordersRes.data ?? []) as unknown as KdsOrderInfo[];
    orderItems = (itemsRes.data ?? []) as unknown as KdsOrderItem[];
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Đang tải KDS…</p>
        </div>
      }
    >
      <KdsBoard
        branchId={branchIdNum}
        stations={stations}
        initialTickets={tickets}
        initialOrders={orders}
        initialOrderItems={orderItems}
      />
    </Suspense>
  );
}
