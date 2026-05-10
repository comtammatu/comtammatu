"use client";

import Link from "next/link";
import { ChartBar as IconChartBar, TrendingUp as IconTrendingUp, ArrowLeftRight as IconArrowLeftRight, Package as IconPackage } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { AppPage, AppPageHeader } from "@/components/surface";
import { SimpleBarChart, TrendSparkline } from "../_lib/chart-primitives";
import { formatVND } from "../_lib/format";
import {
  resolveInventoryColorValue,
  type InventorySemanticColor,
} from "../_lib/ui";
import { messages } from "@lib/messages";

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
      ? messages.inventory.reports.trendNotEnough
      : foodCostTrendDeltaPct > 0
        ? messages.inventory.reports.trendUp(foodCostTrendDeltaPct)
        : foodCostTrendDeltaPct < 0
          ? messages.inventory.reports.trendDown(foodCostTrendDeltaPct)
          : messages.inventory.reports.trendStable;
  const reportCatalog = messages.inventory.reports.catalog.map(
    (report, index) => ({
      ...report,
      icon: [IconChartBar, IconTrendingUp, IconArrowLeftRight, IconPackage][
        index
      ]!,
    }),
  );
  return (
    <AppPage scroll>
      <AppPageHeader density="compact" title={messages.inventory.reports.pageTitle} />

      {/* Dashboard Grid — 12 col asymmetric */}
      <div className="grid grid-cols-12 gap-4">
        {/* Stock Movement Summary — col-span-8 */}
        <Card className="col-span-12 flex flex-col lg:col-span-8">
          <CardContent className="flex flex-1 flex-col p-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <IconChartBar className="size-5 text-primary" />
                </div>
                <h3 className="font-heading text-lg font-bold text-foreground">
                  {messages.inventory.reports.movementTitle}
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-primary" />
                  <span className="text-muted-foreground">
                    {messages.inventory.reports.inbound}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-success" />
                  <span className="text-muted-foreground">
                    {messages.inventory.reports.transferIn}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">
                    {messages.inventory.reports.outboundConsumption}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-info" />
                  <span className="text-muted-foreground">
                    {messages.inventory.reports.production}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex-1">
              <SimpleBarChart data={movementSummary} height={220} />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{trendLabel}</p>
              <Badge variant="outline">
                {messages.inventory.reports.currentMonthSnapshot}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardContent className="p-6">
            <h3 className="font-heading mb-4 text-lg font-bold text-foreground">
              {messages.inventory.reports.supplierPayables}
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
                        {messages.inventory.reports.amountVnd(
                          formatVND(item.amount),
                        )}
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
              asChild
              type="button"
              variant="outline"
              className="mt-6 w-full rounded-full text-muted-foreground"
            >
              <Link href="/inventory/supplier-invoices">
                {messages.inventory.reports.openSupplierDebt}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="col-span-12 md:col-span-6">
          <CardContent className="p-6">
            <h3 className="font-heading mb-2 text-lg font-bold text-foreground">
              {messages.inventory.reports.consumptionVariance}
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {messages.inventory.reports.recipeActualVsStandard}
            </p>
            <div className="space-y-4">
              {consumptionVariance.map((item) => {
                const isUp = item.trend === "up";
                return (
                  <Card
                    key={item.name}
                    className="bg-muted/35 flex items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-card">
                        <IconPackage className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {messages.inventory.reports.unitKg}
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
                        {isUp
                          ? messages.inventory.reports.overStandard
                          : messages.inventory.reports.saving}
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 md:col-span-6">
          <CardContent className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-lg font-bold text-foreground">
                  {messages.inventory.reports.foodCostTrend}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {messages.inventory.reports.foodCostTarget}
                </p>
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
                  {messages.inventory.reports.foodCostByMonth}
                </p>
              </>
            ) : (
              <Empty className="min-h-40 py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">
                    {messages.inventory.reports.foodCostEmptyTitle}
                  </EmptyTitle>
                  <EmptyDescription className="text-xs leading-5">
                    {messages.inventory.reports.foodCostEmptyDescription}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report catalog */}
      <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
        {messages.inventory.reports.detailTitle}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reportCatalog.map((report) => (
          <Card key={report.title}>
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted transition-colors">
                  <report.icon className="size-5 text-muted-foreground" />
                </div>
                <Badge variant="outline">
                  {messages.inventory.reports.comingSoon}
                </Badge>
              </div>
              <p className="font-bold text-foreground">{report.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {report.desc}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppPage>
  );
}
