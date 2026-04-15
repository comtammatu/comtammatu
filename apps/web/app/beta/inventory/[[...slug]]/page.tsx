import Link from "next/link";
import { ArrowUpRight, ArrowLeftRight, Clock3, PackageSearch } from "lucide-react";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { formatVND } from "@comtammatu/shared/format";
import { loadInventoryDashboardData } from "@/inventory/_lib/dashboard-data";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const legacyHref =
    route?.legacyHref ?? `/inventory/${slug.join("/")}`.replace(/\/$/, "");

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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_24rem]">
        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <Badge variant="secondary" className="w-fit rounded-full bg-primary/10 px-3 py-1 text-primary">
              Live inventory signals
            </Badge>
            <CardTitle className="font-heading text-4xl">Cảnh báo và nhịp xử lý</CardTitle>
            <CardDescription className="text-base leading-7">
              Dữ liệu này đến trực tiếp từ loader inventory hiện tại để beta phản ánh đúng trạng thái vận hành.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-4xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <PackageSearch className="size-4 text-primary" />
                <p className="font-medium text-foreground">Nguyên liệu chạm ngưỡng</p>
              </div>
              {data.reorderAlerts.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  Chưa có cảnh báo tái đặt hàng trong phạm vi site hiện tại.
                </p>
              ) : (
                data.reorderAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={`${alert.ingredientId}-${alert.branchId}`}
                    className="rounded-2xl border border-border/60 bg-card px-4 py-3"
                  >
                    <p className="font-medium text-foreground">{alert.name}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Còn {alert.current} {alert.unit} • ngưỡng {alert.reorder} {alert.unit}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 rounded-4xl border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-primary" />
                <p className="font-medium text-foreground">Lô gần hết hạn</p>
              </div>
              {data.expiryAlerts.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  Chưa có lô nào chạm ngưỡng cảnh báo hạn dùng.
                </p>
              ) : (
                data.expiryAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-2xl border border-border/60 bg-card px-4 py-3"
                  >
                    <p className="font-medium text-foreground">{alert.ingredientName}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {alert.lot || "Không có lô"} • còn {alert.daysLeft} ngày
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-4xl">Điều chuyển gần đây</CardTitle>
            <CardDescription className="text-base leading-7">
              Luồng hàng đang xử lý trong phạm vi loader inventory hiện tại.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.transfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có lệnh điều chuyển nào trong phạm vi site hiện tại.
              </p>
            ) : (
              data.transfers.slice(0, 4).map((transfer) => (
                <div
                  key={transfer.id}
                className="rounded-3xl border border-border/60 bg-background/75 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{transfer.code}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {transfer.fromBranch} → {transfer.toBranch}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {transfer.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}

            <div className="rounded-3xl border border-border/60 bg-muted/35 p-4">
              <Link href="/beta/inventory/transfers" className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ArrowLeftRight className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">Mở điều chuyển beta</span>
                  <span className="block text-sm leading-6 text-muted-foreground">
                    Đi sang route mirror của điều chuyển trong shell beta.
                  </span>
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
