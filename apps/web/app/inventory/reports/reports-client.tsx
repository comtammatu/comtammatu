"use client";

import {
  FileDown,
  BarChart3,
  TrendingUp,
  ArrowLeftRight,
  Package,
  Calendar,
  Store,
  ChevronDown,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  Button,
} from "@comtammatu/ui/components/button";
import {
  SimpleBarChart,
  TrendSparkline,
  PageHeader,
  resolveInventoryColorValue,
  type InventorySemanticColor,
} from "../_components/shared";
import { EmptyState } from "@/components/foundation/ui-patterns";
import { formatVND } from "../_lib/format";

export type ApAgingItem = { range: string; amount: number };
export type VarianceItem = {
  name: string;
  actual: string;
  trend: "up" | "down";
};

export type ReportsProps = {
  movementSummary: Array<{
    label: string;
    values: { value: number; color: InventorySemanticColor }[];
  }>;
  apAging: ApAgingItem[];
  consumptionVariance: VarianceItem[];
  foodCostTrend: number[];
  foodCostTrendAvailable: boolean;
  foodCostTrendDeltaPct: number | null;
};

export function ReportsClient({
  movementSummary,
  apAging,
  consumptionVariance,
  foodCostTrend,
  foodCostTrendAvailable,
  foodCostTrendDeltaPct,
}: ReportsProps) {
  const maxAP = Math.max(...apAging.map((a) => a.amount), 1);
  const trendLabel =
    foodCostTrendDeltaPct == null
      ? "Chưa đủ dữ liệu để so sánh tháng trước"
      : foodCostTrendDeltaPct > 0
        ? `Tăng ${foodCostTrendDeltaPct}% so với tháng trước`
        : foodCostTrendDeltaPct < 0
          ? `Giảm ${Math.abs(foodCostTrendDeltaPct)}% so với tháng trước`
          : "Ổn định so với tháng trước";
  const overdueAmount = apAging[apAging.length - 1]?.amount ?? 0;
  const varianceCount = consumptionVariance.length;
  const panelClassName = "rounded-lg border bg-card shadow-sm";
  const pillClassName = cn(
    panelClassName,
    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hệ thống Báo cáo"
      />

      {/* Filter bar */}
      <div
        className={cn(
          panelClassName,
          "px-5 py-5 sm:px-6",
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn(pillClassName, "")}>
                <Calendar className="size-4 text-primary" />
                <span className="text-foreground">Tháng này</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </div>
              <div className={cn(pillClassName, "")}>
                <Store className="size-4 text-primary" />
                <span className="text-foreground">Tất cả chi nhánh</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={cn(panelClassName, "px-4 py-4")}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Công nợ quá hạn
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatVND(overdueAmount)}đ
              </p>
            </div>
            <div
              className={cn(panelClassName, "px-4 py-4")}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Mã lệch định mức
              </p>
              <p className="mt-2 text-2xl font-semibold">{varianceCount}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-primary/30 bg-card px-5 font-bold text-primary hover:bg-muted"
          >
            <FileDown className="size-4" />
            Xuất CSV/Excel
          </Button>
        </div>
      </div>

      {/* Dashboard Grid — 12 col asymmetric */}
      <div className="grid grid-cols-12 gap-6">
        {/* Stock Movement Summary — col-span-8 */}
        <div
          className={cn(
            panelClassName,
            "col-span-12 flex flex-col p-6 lg:col-span-8",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Biến động kho theo nhóm</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Nhập kho</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-success" />
              <span className="text-muted-foreground">Chuyển vào</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Xuất / tiêu hao</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-info" />
              <span className="text-muted-foreground">Sản xuất</span>
            </span>
          </div>
        </div>
        <div className="flex-1">
          <SimpleBarChart data={movementSummary} height={220} />
        </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{trendLabel}</p>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-bold text-primary hover:underline"
            >
              Chi tiết
            </button>
          </div>
        </div>

        {/* Supplier AP Aging — col-span-4 */}
        <div
          className={cn(
            panelClassName,
            "col-span-12 p-6 lg:col-span-4",
          )}
        >
          <h3 className="mb-4 text-lg font-bold text-foreground">Công nợ nhà cung cấp</h3>
          <div className="space-y-4">
            {apAging.map((item, idx) => {
              const isOverdue = idx === apAging.length - 1;
              const barColor =
                idx === 0
                  ? resolveInventoryColorValue("success")
                  : idx === 1
                    ? resolveInventoryColorValue("primary")
                    : idx === 2
                      ? resolveInventoryColorValue("warning")
                      : resolveInventoryColorValue("danger");
              return (
                <div
                  key={item.range}
                  className={cn(
                    " rounded-lg p-3",
                    isOverdue
                      ? "border border-destructive/20 bg-destructive/12"
                      : "bg-muted/35",
                  )}
                >
                  <div className="mb-1 flex justify-between text-xs">
                    <span className={cn(isOverdue ? "text-destructive" : "text-muted-foreground")}>
                      {item.range}
                    </span>
                    <span className={cn("font-bold", isOverdue ? "text-destructive" : "text-foreground")}>
                      {formatVND(item.amount)}đ
                    </span>
                  </div>
                  <div
                    className={cn(
                      "h-2 w-full overflow-hidden rounded-full",
                      isOverdue ? "bg-destructive/20" : "bg-muted",
                    )}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(item.amount / maxAP) * 100}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full rounded-full text-muted-foreground"
          >
            Xem danh sách NCC
          </Button>
        </div>

        {/* Consumption Variance — col-span-6 */}
        <div
          className={cn(
            panelClassName,
            "col-span-12 p-6 md:col-span-6",
          )}
        >
          <h3 className="mb-2 text-lg font-bold text-foreground">
            Chênh lệch tiêu hao
          </h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Thực tế vs Định mức Recipe
          </p>
          <div className="space-y-4">
            {consumptionVariance.map((item) => {
              const isUp = item.trend === "up";
              return (
                <div
                  key={item.name}
                  className=" flex items-center justify-between rounded-lg border border-border bg-muted/35 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-card">
                      <Package className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">Đơn vị: kg</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isUp ? "text-destructive" : "text-success",
                      )}
                    >
                      {item.actual}
                    </p>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-label font-bold",
                        isUp
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/10 text-success",
                      )}
                    >
                      {isUp ? "Vượt định mức" : "Tiết kiệm"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Food Cost by Period — col-span-6 */}
        <div
          className={cn(
            panelClassName,
            "col-span-12 p-6 md:col-span-6",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Xu hướng food cost
              </h3>
              <p className="text-sm text-muted-foreground">Mục tiêu 30%</p>
            </div>
          </div>
          {foodCostTrendAvailable ? (
            <>
              <TrendSparkline
                data={foodCostTrend}
                width={400}
                height={120}
                color="primary"
                target={30}
              />
              <p
                className="mt-2 text-xs text-muted-foreground"
              >
                Food cost theo tháng.
              </p>
            </>
          ) : (
            <EmptyState
              title="Chưa có đủ dữ liệu food cost"
              description="Cần thêm dữ liệu thực tế."
              className="min-h-40 border-dashed bg-muted/20"
            />
          )}
        </div>
      </div>

      {/* Report catalog */}
      <p className="text-xl font-bold text-foreground">Báo cáo chi tiết</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: BarChart3,
            title: "Biến động kho chi tiết",
            desc: "Lịch sử nhập, xuất từng mã.",
          },
          {
            icon: TrendingUp,
            title: "Chênh lệch định mức",
            desc: "Hao hụt theo định mức.",
          },
          {
            icon: ArrowLeftRight,
            title: "Luân chuyển đang vận chuyển",
            desc: "Hàng đang đi nội bộ.",
          },
          {
            icon: Package,
            title: "Tồn kho cuối kỳ",
            desc: "Giá trị tồn khi chốt.",
          },
        ].map((report) => (
          <div
            key={report.title}
            className={cn(
              panelClassName,
              "group cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-md",
            )}
          >
            <div
              className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted transition-colors"
            >
              <report.icon className="size-5 text-muted-foreground" />
            </div>
            <p className="font-bold text-foreground">{report.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {report.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
