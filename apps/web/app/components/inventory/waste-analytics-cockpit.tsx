"use client";

import { useMemo } from "react";
import {
  PieChart as IconPieChart,
  Clock as IconClock,
  ShieldCheck as IconShield,
  Flame as IconFlame,
  AlertCircle as IconAlert,
} from "lucide-react";
import { formatCount, formatPercent, formatQuantity } from "@comtammatu/shared/format";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Frame } from "@comtammatu/ui/components/frame";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { formatVND } from "@lib/inventory/format";
import type {
  TopLossIngredientItem,
  WasteAnalyticsSummary,
} from "@lib/inventory/waste-analytics-data";

export function WasteAnalyticsCockpit({
  data,
  branchName,
}: {
  data: WasteAnalyticsSummary | null;
  branchName?: string | null;
}) {
  const columns = useMemo<DataTableColumn<TopLossIngredientItem>[]>(
    () => [
      {
        key: "name",
        header: "Nguyên vật liệu",
        className: "font-semibold",
        render: (item: TopLossIngredientItem) => (
          <span className="truncate">{item.ingredientName}</span>
        ),
      },
      {
        key: "category",
        header: "Nhóm",
        className: "text-muted-foreground",
        render: (item: TopLossIngredientItem) => (
          <span>{item.categoryName || "—"}</span>
        ),
      },
      {
        key: "quantity",
        header: "Khối lượng",
        className: "text-right tabular-nums",
        render: (item: TopLossIngredientItem) => (
          <span>
            {formatQuantity(item.totalQuantity)} {item.unitCode}
          </span>
        ),
      },
      {
        key: "cost",
        header: "Chi phí tổn thất",
        className: "text-right font-semibold text-destructive tabular-nums",
        render: (item: TopLossIngredientItem) => (
          <span>{formatVND(item.totalCost)}</span>
        ),
      },
      {
        key: "percentage",
        header: "Tỷ trọng",
        className: "text-right tabular-nums",
        render: (item: TopLossIngredientItem) => (
          <Badge variant="outline" className="text-2xs">
            {formatPercent(item.percentageOfTotal)}
          </Badge>
        ),
      },
    ],
    [],
  );

  if (!data) {
    return (
      <Frame className="p-4 text-center text-muted-foreground">
        <IconAlert className="size-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm">{INVENTORY_VI.wasteAnalyticsNoData}</p>
      </Frame>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Frame className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>{INVENTORY_VI.wasteAnalyticsTotalLossValue}</span>
            <IconFlame className="size-4 text-destructive" />
          </div>
          <div className="text-xl font-semibold text-destructive tabular-nums">
            {formatVND(data.totalLossCost)}
          </div>
          <div className="text-2xs text-muted-foreground">
            {branchName ? `${branchName} • ` : ""}{INVENTORY_VI.wasteAnalyticsInReportPeriod}
          </div>
        </Frame>

        <Frame className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>{INVENTORY_VI.wasteAnalyticsIssueCountTitle}</span>
            <IconPieChart className="size-4 text-primary" />
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCount(data.totalIssueCount)}
          </div>
          <div className="text-2xs text-muted-foreground">
            {INVENTORY_VI.wasteAnalyticsIssueCountSubtitle}
          </div>
        </Frame>

        <Frame className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>{INVENTORY_VI.wasteAnalyticsSelfReviewRate}</span>
            <IconShield className="size-4 text-warning" />
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatPercent(data.selfApprovalRate)}
          </div>
          <div className="text-2xs text-muted-foreground">
            {INVENTORY_VI.wasteAnalyticsSelfApprovedSlips(data.selfApprovedSlipCount, data.totalApprovedSlipCount)}
          </div>
        </Frame>

        <Frame className="p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>{INVENTORY_VI.wasteAnalyticsItemCountTitle}</span>
            <IconAlert className="size-4 text-info" />
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCount(data.topLossItems.length)}
          </div>
          <div className="text-2xs text-muted-foreground">
            {INVENTORY_VI.wasteAnalyticsItemCountSubtitle}
          </div>
        </Frame>
      </div>

      {/* Breakdown Row: Reasons & Shifts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Reasons breakdown */}
        <Frame className="p-4 lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <IconPieChart className="size-4 text-primary" />
              <span>{INVENTORY_VI.wasteAnalyticsReasonBreakdown}</span>
            </h3>
            <span className="text-2xs text-muted-foreground">{INVENTORY_VI.wasteAnalyticsByCost}</span>
          </div>

          <div className="flex flex-col gap-3">
            {data.reasons.map((reason) => (
              <div key={reason.reasonKey} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{reason.label}</span>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">{formatVND(reason.totalCost)}</span>
                    <Badge variant="outline" className="text-2xs">
                      {formatPercent(reason.percentage)}
                    </Badge>
                  </div>
                </div>
                <Progress value={Math.round(reason.percentage * 100)} className="h-1.5" />
              </div>
            ))}
          </div>
        </Frame>

        {/* Shifts breakdown */}
        <Frame className="p-4 lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <IconClock className="size-4 text-primary" />
              <span>{INVENTORY_VI.wasteAnalyticsShiftBreakdown}</span>
            </h3>
            <span className="text-2xs text-muted-foreground">{INVENTORY_VI.wasteAnalyticsByShift}</span>
          </div>

          <div className="flex flex-col gap-2">
            {data.shifts.map((shift) => (
              <div
                key={shift.shiftKey}
                className="flex items-center justify-between p-2 rounded border border-border bg-card text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{shift.label}</span>
                  <span className="text-2xs text-muted-foreground">
                    {INVENTORY_VI.wasteAnalyticsShiftSlips(shift.issueCount)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-destructive tabular-nums">
                    {formatVND(shift.totalCost)}
                  </span>
                </div>
              </div>
            ))}

            {data.shifts.length === 0 && (
              <div className="p-3 text-center text-xs text-muted-foreground">
                {INVENTORY_VI.wasteAnalyticsNoShiftData}
              </div>
            )}
          </div>
        </Frame>
      </div>

      {/* Top Loss Items Table */}
      <Frame className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <IconFlame className="size-4 text-destructive" />
            <span>{INVENTORY_VI.wasteAnalyticsTopLossTitle}</span>
          </h3>
          <span className="text-2xs text-muted-foreground">{INVENTORY_VI.wasteAnalyticsRankByCost}</span>
        </div>

        <DataTable
          columns={columns}
          data={data.topLossItems}
          getRowKey={(item) => String(item.ingredientId)}
          pageSize={10}
        />
      </Frame>
    </div>
  );
}
