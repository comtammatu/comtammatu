"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { cn } from "@comtammatu/ui";
import {
  IconAlertTriangle,
  IconBox,
  IconCoin,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";
import type { DashboardSummary, DashboardInTransit } from "../dashboard-actions";

interface DashboardSummaryCardsProps {
  summary: DashboardSummary;
  inTransit: DashboardInTransit[];
  canViewCost: boolean;
  className?: string;
}

/**
 * 4 top cards on inventory dashboard (S12):
 *   - Tổng giá trị tồn (cost-gated)
 *   - Số SKU
 *   - Số alert
 *   - Số mặt hàng in-transit
 */
export function DashboardSummaryCards({
  summary,
  inTransit,
  canViewCost,
  className,
}: DashboardSummaryCardsProps) {
  const inTransitCount = inTransit.length;
  const inTransitQty = inTransit.reduce(
    (sum, t) => sum + Number(t.totalQuantity || 0),
    0,
  );

  return (
    <div
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}
    >
      <SummaryCard
        icon={<IconCoin className="size-5 text-emerald-600" />}
        label="Tổng giá trị tồn"
        value={
          canViewCost
            ? formatVND(summary.totalValueVnd ?? 0)
            : "—"
        }
        hint={canViewCost ? undefined : "Không có quyền xem cost"}
      />
      <SummaryCard
        icon={<IconBox className="size-5 text-blue-600" />}
        label="Số SKU đang hoạt động"
        value={String(summary.totalSkus)}
        hint={`${summary.locationCount} location`}
      />
      <SummaryCard
        icon={
          <IconAlertTriangle
            className={cn(
              "size-5",
              summary.alertsCount > 0 ? "text-orange-600" : "text-muted-foreground",
            )}
          />
        }
        label="Alert tồn thấp"
        value={String(summary.alertsCount)}
        hint={summary.alertsCount === 0 ? "Tất cả trên ngưỡng" : "Cần bổ sung"}
        tone={summary.alertsCount > 0 ? "warning" : "default"}
      />
      <SummaryCard
        icon={<IconTruckDelivery className="size-5 text-purple-600" />}
        label="In-transit"
        value={String(inTransitCount)}
        hint={inTransitCount > 0 ? `Tổng ${inTransitQty}` : "Không có chuyển kho"}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card
      className={cn(
        tone === "warning" && "border-orange-200 bg-orange-50/50",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </CardTitle>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
