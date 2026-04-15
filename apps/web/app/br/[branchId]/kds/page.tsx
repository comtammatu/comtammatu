import { Suspense, type ReactNode } from "react";
import { ChefHat, Loader2, TriangleAlert } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
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

const ROUTE_STATE_BADGE: Record<
  "todo" | "current" | "done",
  { badgeText: string; border: string; index: string }
> = {
  todo: {
    badgeText: "text-muted-foreground border-border bg-muted text-muted-foreground",
    border: "border-border",
    index: "border-border text-muted-foreground",
  },
  current: {
    badgeText: "bg-primary text-primary-foreground",
    border: "border-primary",
    index: "bg-primary text-primary-foreground border-primary",
  },
  done: {
    badgeText: "bg-success text-success",
    border: "border-success",
    index: "bg-success text-success border-success",
  },
};

const ROUTE_TONE_BADGE: Record<
  "info" | "warning" | "danger",
  "info" | "warning" | "destructive"
> = {
  info: "info",
  warning: "warning",
  danger: "destructive",
};

function KdsRouteState({
  title,
  description,
  status,
  statusTone,
  steps,
}: {
  title: string;
  description: string;
  status: ReactNode;
  statusTone: "info" | "warning" | "danger";
  steps: Array<{
    label: string;
    description: string;
    state: "todo" | "current" | "done";
  }>;
}) {
  return (
    <Card className="bg-background/30">
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border bg-muted text-muted-foreground">
            <ChefHat className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-3xl">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge
          variant={ROUTE_TONE_BADGE[statusTone]}
          className="inline-flex w-fit px-3 py-1 text-xs font-semibold"
        >
          <span className="inline-flex items-center gap-1">{status}</span>
        </Badge>
      </CardHeader>
      <CardContent>
        {steps?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => {
              const style = ROUTE_STATE_BADGE[step.state];
              return (
                <div key={`${step.label}-${index}`} className={`rounded-lg border p-3 ${style.border}`}>
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${style.index}`}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
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
      <KdsRouteState
        title="Không thể dựng bảng điều phối bếp"
        description="Không tải được trạm KDS."
        status={
          <>
            <TriangleAlert className="size-3.5" />
            <span>Lỗi tải trạm KDS</span>
          </>
        }
        statusTone="danger"
        steps={[
          {
            label: "Xác minh quyền bếp",
            description: "Đã xác minh quyền truy cập.",
            state: "done",
          },
          {
            label: "Nạp trạm chế biến",
            description: "Đang tải trạm hoạt động.",
            state: "current",
          },
          {
            label: "Hiển thị đơn đang chạy",
            description: "Mở bảng điều phối.",
            state: "todo",
          },
        ]}
      />
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
        <KdsRouteState
          title="Đang dựng bảng điều phối bếp"
          description="Đang nạp trạm và đơn."
          status={
            <>
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              <span>Đồng bộ ticket nhà bếp</span>
            </>
          }
          statusTone="info"
        steps={[
            {
              label: "Station sẵn sàng",
              description: "Danh sách trạm đã sẵn sàng.",
              state: "done",
            },
            {
              label: "Ghép ticket và đơn",
              description: "Đang ghép món và trạng thái.",
              state: "current",
            },
            {
              label: "Mở board thao tác",
              description: "Mở board thao tác.",
              state: "todo",
            },
          ]}
        />
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
