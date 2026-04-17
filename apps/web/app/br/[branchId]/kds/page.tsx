import { Suspense } from "react";
import { ChefHat, Loader2, TriangleAlert } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { KdsBoard } from "./kds-board";

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

  // Fetch stations for this branch
  const { data: rawStations, error: stationsError } = await supabase
    .from("kds_stations")
    .select("id, name, position, is_active")
    .eq("branch_id", branchIdNum)
    .eq("is_active", true)
    .order("position");

  if (stationsError) {
    return (
      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-4">
                <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                  <ChefHat className="size-5" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Không mở được màn hình bếp
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    Không tải được danh sách trạm bếp.
                  </p>
                </div>
              </div>
              <Badge variant="destructive">
                <TriangleAlert className="size-3.5" />
                <span>Lỗi tải trạm bếp</span>
              </Badge>
            </div>
            <ol className="grid gap-3 lg:grid-cols-3">
              <li>
                <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Xác minh quyền bếp
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đã xác minh quyền truy cập.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border border-amber-200 bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 2
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Nạp trạm chế biến
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đang tải trạm hoạt động.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 3
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Hiển thị đơn đang chạy
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mở bảng điều phối.
                    </p>
                  </CardContent>
                </Card>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fetch active tickets for this branch
  const { data: rawTickets, error: ticketsError } = await supabase
    .from("kds_tickets")
    .select(
      "id, station_id, order_id, order_item_id, status, bumped_at, created_at",
    )
    .eq("branch_id", branchIdNum)
    .in("status", ["pending", "preparing", "ready"])
    .order("created_at");

  if (ticketsError) {
    return (
      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-4">
                <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                  <ChefHat className="size-5" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Không mở được màn hình bếp
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    Không tải được món chờ chế biến.
                  </p>
                </div>
              </div>
              <Badge variant="destructive">
                <TriangleAlert className="size-3.5" />
                <span>Lỗi tải món bếp</span>
              </Badge>
            </div>
            <ol className="grid gap-3 lg:grid-cols-3">
              <li>
                <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Xác minh quyền bếp
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đã xác minh quyền truy cập.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 2
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Nạp trạm chế biến
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đã tải trạm hoạt động.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border border-amber-200 bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 3
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Hiển thị đơn đang chạy
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Không thể tải món chờ chế biến.
                    </p>
                  </CardContent>
                </Card>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

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
        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-4">
                  <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                    <ChefHat className="size-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-3xl font-semibold tracking-tight">
                      Đang mở màn hình bếp
                    </h2>
                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                      Đang nạp trạm và đơn.
                    </p>
                  </div>
                </div>
                <Badge variant="info">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                  <span>Đang tải phiếu bếp</span>
                </Badge>
              </div>
              <ol className="grid gap-3 lg:grid-cols-3">
                <li>
                  <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 1
                      </p>
                    <h3 className="mt-2 text-base font-semibold">
                        Trạm bếp sẵn sàng
                    </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Danh sách trạm đã sẵn sàng.
                      </p>
                    </CardContent>
                  </Card>
                </li>
                <li>
                  <Card className="rounded-lg border border-amber-200 bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 2
                      </p>
                    <h3 className="mt-2 text-base font-semibold">
                        Đang tải món đang làm
                    </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Đang ghép món và trạng thái.
                      </p>
                    </CardContent>
                  </Card>
                </li>
                <li>
                  <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 3
                      </p>
                      <h3 className="mt-2 text-base font-semibold">
                        Mở board thao tác
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Mở board thao tác.
                      </p>
                    </CardContent>
                  </Card>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
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
