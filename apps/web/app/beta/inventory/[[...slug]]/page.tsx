import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, Clock3, PackageSearch } from "lucide-react";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { formatVND } from "@comtammatu/shared/format";
import { loadInventoryDashboardData } from "@/inventory/_lib/dashboard-data";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  findInventoryBetaRoute,
  getInventoryBetaRouteGroups,
  getSiblingRoutes,
} from "../../_lib/routes";
import { RouteScaffold } from "../../_components/route-scaffold";

export default async function BetaInventoryRoutePage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const route = findInventoryBetaRoute(slug);
  const data = await loadInventoryDashboardData();

  const related = route
    ? getSiblingRoutes(
        getInventoryBetaRouteGroups(),
        route.section,
        route.pattern,
        "/beta/inventory",
      )
    : [];

  const title = route?.title ?? "Route kho beta";
  const description =
    route?.description ??
    "Route này đang được giữ trong cây beta để deep-link không đứt, dù workflow sâu vẫn tiếp tục mở dần.";
  const legacyHref = route?.legacyHref ?? `/inventory/${slug.join("/")}`.replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <RouteScaffold
        eyebrow={route?.section ?? "Kho vận"}
        title={title}
        description={description}
        legacyHref={legacyHref || "/inventory"}
        status={route?.availability ?? "transition"}
        related={related}
        summary={[
          {
            label: "Giá trị tồn",
            value: formatVND(data.totalStockValue),
            detail: `Theo ${getInventorySiteKindLabelVi(data.siteKind)} • ${data.siteName}`,
          },
          {
            label: "Điều chuyển mở",
            value: String(data.activeTransfers),
            detail: "Số lệnh điều chuyển đang ở trạng thái hoạt động.",
          },
          {
            label: "Kiểm kê mở",
            value: String(data.activeStocktakes),
            detail: "Số phiên kiểm kê đang chạy trong phạm vi site hiện tại.",
          },
          {
            label: "PO chờ xử lý",
            value: String(data.pendingPO),
            detail: "Đơn mua ở trạng thái draft hoặc sent.",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Dữ liệu thật
              </Badge>
              <CardTitle>Cảnh báo và nhịp xử lý</CardTitle>
              <CardDescription>Dữ liệu này đến trực tiếp từ loader inventory hiện tại.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center gap-2">
                  <PackageSearch className="size-4 text-primary" />
                  <p className="font-medium text-foreground">Nguyên liệu chạm ngưỡng</p>
                </div>
                {data.reorderAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có cảnh báo tái đặt hàng trong phạm vi site hiện tại.
                  </p>
                ) : (
                  data.reorderAlerts.slice(0, 3).map((alert) => (
                    <div key={`${alert.ingredientId}-${alert.branchId}`} className="rounded-md border px-4 py-3">
                      <p className="font-medium text-foreground">{alert.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Còn {alert.current} {alert.unit} • ngưỡng {alert.reorder} {alert.unit}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="size-4 text-primary" />
                  <p className="font-medium text-foreground">Lô gần hết hạn</p>
                </div>
                {data.expiryAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có lô nào chạm ngưỡng cảnh báo hạn dùng.
                  </p>
                ) : (
                  data.expiryAlerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className="rounded-md border px-4 py-3">
                      <p className="font-medium text-foreground">{alert.ingredientName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {alert.lot || "Không có lô"} • còn {alert.daysLeft} ngày
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Điều chuyển gần đây</CardTitle>
            <CardDescription>Luồng hàng đang xử lý trong phạm vi loader inventory hiện tại.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.transfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có lệnh điều chuyển nào trong phạm vi site hiện tại.
              </p>
            ) : (
              data.transfers.slice(0, 4).map((transfer) => (
                <div key={transfer.id} className="rounded-md border px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{transfer.code}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {transfer.fromBranch} → {transfer.toBranch}
                      </p>
                    </div>
                    <Badge variant="outline">{transfer.status}</Badge>
                  </div>
                </div>
              ))
            )}

            <div className="rounded-md border bg-muted px-4 py-4">
              <Link
                href="/beta/inventory/transfers"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "default" }),
                  "h-auto w-full justify-between px-0",
                )}
              >
                <span className="flex items-center gap-3">
                  <ArrowLeftRight className="size-4" />
                  <span>
                    <span className="block font-medium text-foreground">Mở điều chuyển beta</span>
                    <span className="block text-sm text-muted-foreground">
                      Đi sang route mirror của điều chuyển trong beta.
                    </span>
                  </span>
                </span>
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
