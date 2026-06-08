"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle as IconAlertTriangle,
  ClipboardList as IconClipboardList,
  Hourglass as IconHourglass,
  Package as IconPackage,
  Receipt as IconReceipt,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import type { InventoryDashboardData } from "./_lib/dashboard-data";

type DashboardClientProps = InventoryDashboardData & {
  routeBase: "/inventory";
};

function KpiCard({
  icon,
  title,
  value,
  helper,
  href,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  helper: string;
  href?: string;
}) {
  const body = (
    <Card size="sm" className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <CardTitle className="truncate">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block h-full rounded-lg">
      {body}
    </Link>
  );
}

export function DashboardClient(props: DashboardClientProps) {
  const {
    routeBase,
    siteName,
    showProcurement,
    totalStockValue,
    activeStocktakes,
    reorderAlerts,
    expiryAlerts,
    recentActivity,
  } = props;

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow="Kho hàng"
        title="Hôm nay"
        description={`Tổng quan tồn kho — ${siteName}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<IconPackage className="size-4" />}
          title="Giá trị tồn"
          value={totalStockValue > 0 ? formatVND(totalStockValue) : "—"}
          helper="Tổng giá trị tồn kho hiện tại"
          href={`${routeBase}/stock`}
        />
        <KpiCard
          icon={<IconAlertTriangle className="size-4" />}
          title="Cần đặt hàng"
          value={String(reorderAlerts.length)}
          helper="Nguyên liệu dưới mức tồn tối thiểu"
          href={`${routeBase}/stock`}
        />
        <KpiCard
          icon={<IconHourglass className="size-4" />}
          title="Sắp hết hạn"
          value={String(expiryAlerts.length)}
          helper="Lô hàng cận date"
          href={`${routeBase}/stock`}
        />
        <KpiCard
          icon={<IconClipboardList className="size-4" />}
          title="Đang kiểm kê"
          value={String(activeStocktakes)}
          helper="Phiên kiểm kê đang mở"
          href={`${routeBase}/stocktake`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AppSection
          size="sm"
          title="Cảnh báo đặt hàng"
          icon={<IconAlertTriangle className="size-4" />}
        >
          {reorderAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không có nguyên liệu dưới mức tồn tối thiểu.
            </p>
          ) : (
            <div className="space-y-2">
              {reorderAlerts.slice(0, 6).map((a) => (
                <div
                  key={`${a.ingredientId}-${a.branchId}`}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  <p className="min-w-0 truncate text-sm font-medium">
                    {a.name}
                  </p>
                  <p className="shrink-0 font-mono text-sm tabular-nums text-warning">
                    {a.current}/{a.reorder} {a.unit}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AppSection>

        <AppSection
          size="sm"
          title="Sắp hết hạn"
          icon={<IconHourglass className="size-4" />}
        >
          {expiryAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không có lô hàng cận date.
            </p>
          ) : (
            <div className="space-y-2">
              {expiryAlerts.slice(0, 6).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {e.ingredientName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.expiryDate}
                    </p>
                  </div>
                  <Badge
                    variant={e.daysLeft <= 0 ? "destructive" : "outline"}
                    className="shrink-0"
                  >
                    {e.daysLeft <= 0 ? "Hết hạn" : `${e.daysLeft} ngày`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </AppSection>

        {showProcurement ? (
          <AppSection
            size="sm"
            title="Hoạt động gần đây"
            icon={<IconReceipt className="size-4" />}
            className="xl:col-span-2"
          >
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có phiếu nhập hoặc hóa đơn gần đây.
              </p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a) => (
                  <div
                    key={`${a.type}-${a.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.code} · {a.supplier}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.type === "grn" ? "Phiếu nhập" : "Hóa đơn NCC"} ·{" "}
                        {a.status}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm tabular-nums">
                      {a.total != null ? formatVND(a.total) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </AppSection>
        ) : null}
      </div>
    </AppPage>
  );
}
