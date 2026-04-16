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
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { EmptyStatePanel } from "@/components/patterns";
import { SimpleBarChart, TrendSparkline } from "../_lib/chart-primitives";
import { formatVND } from "../_lib/format";
import {
  resolveInventoryColorValue,
  type InventorySemanticColor,
} from "../_lib/ui";

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

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Báo cáo
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">Hệ thống báo cáo</CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                Tổng hợp biến động kho, công nợ và chênh lệch tiêu hao theo cùng
                một nhịp vận hành.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/70">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-center">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium shadow-sm">
                  <Calendar className="size-4 text-primary" />
                  <span className="text-foreground">Tháng này</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium shadow-sm">
                  <Store className="size-4 text-primary" />
                  <span className="text-foreground">Tất cả chi nhánh</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="shadow-none">
                <CardContent className="bg-muted/20 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Công nợ quá hạn
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatVND(overdueAmount)}đ
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="bg-muted/20 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Mã lệch định mức
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{varianceCount}</p>
                </CardContent>
              </Card>
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
        </CardContent>
      </Card>

      {/* Dashboard Grid — 12 col asymmetric */}
      <div className="grid grid-cols-12 gap-6">
        {/* Stock Movement Summary — col-span-8 */}
        <Card className="col-span-12 flex flex-col shadow-sm lg:col-span-8">
          <CardContent className="flex flex-1 flex-col p-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <BarChart3 className="size-5 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  Biến động kho theo nhóm
                </h3>
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
              <Button type="button" variant="link" className="font-bold">
                Chi tiết
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 shadow-sm lg:col-span-4">
          <CardContent className="p-6">
            <h3 className="mb-4 text-lg font-bold text-foreground">
              Công nợ nhà cung cấp
            </h3>
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
                      "rounded-lg p-3",
                      isOverdue
                        ? "border border-destructive/20 bg-destructive/12"
                        : "bg-muted/35",
                    )}
                  >
                    <div className="mb-1 flex justify-between text-xs">
                      <span
                        className={cn(
                          isOverdue
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.range}
                      </span>
                      <span
                        className={cn(
                          "font-bold",
                          isOverdue ? "text-destructive" : "text-foreground",
                        )}
                      >
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
          </CardContent>
        </Card>

        <Card className="col-span-12 shadow-sm md:col-span-6">
          <CardContent className="p-6">
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
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/35 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-card">
                        <Package className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Đơn vị: kg
                        </p>
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
                      <Badge variant={isUp ? "destructive" : "success"}>
                        {isUp ? "Vượt định mức" : "Tiết kiệm"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 shadow-sm md:col-span-6">
          <CardContent className="p-6">
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Food cost theo tháng.
                </p>
              </>
            ) : (
              <EmptyStatePanel
                title="Chưa có đủ dữ liệu food cost"
                description="Cần thêm dữ liệu thực tế."
                className="min-h-40 border-dashed bg-muted/20"
              />
            )}
          </CardContent>
        </Card>
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
          <Card
            key={report.title}
            className="group cursor-pointer shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardContent className="p-5">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted transition-colors">
                <report.icon className="size-5 text-muted-foreground" />
              </div>
              <p className="font-bold text-foreground">{report.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {report.desc}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
