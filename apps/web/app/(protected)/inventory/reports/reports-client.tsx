"use client";

import Link from "next/link";
import {
  ChartBar as IconChartBar,
  TrendingUp as IconTrendingUp,
  ArrowLeftRight as IconArrowLeftRight,
  Package as IconPackage,
} from "lucide-react";
import { formatPercent, formatQuantity } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { SimpleBarChart, TargetTrendSparkline } from "../_lib/chart-primitives";
import { formatVND } from "@lib/inventory/format";
import {
  resolveInventoryColorValue,
  type InventorySemanticColor,
} from "../_lib/ui";
import { messages } from "@lib/messages";

import { WasteAnalyticsCockpit } from "@/components/inventory/waste-analytics-cockpit";
import type { WasteAnalyticsSummary } from "@lib/inventory/waste-analytics-data";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

export type ApAgingItem = { range: string; amount: number };
export type VarianceItem = {
  name: string;
  actual: string;
  trend: "up" | "down";
};

export type ReportsProps = {
  movementSummary: Array<{
    label: string;
    values: {
      label: string;
      value: number;
      color: InventorySemanticColor;
    }[];
  }>;
  apAging: ApAgingItem[];
  showSupplierPayables: boolean;
  consumptionVariance: VarianceItem[];
  foodCostTrend: { label: string; value: number }[];
  foodCostTrendAvailable: boolean;
  foodCostTrendDeltaPct: number | null;
  wasteAnalytics: WasteAnalyticsSummary | null;
};

export function ReportsClient({
  movementSummary,
  apAging,
  showSupplierPayables,
  consumptionVariance,
  foodCostTrend,
  foodCostTrendAvailable,
  foodCostTrendDeltaPct,
  wasteAnalytics,
}: ReportsProps) {
  const maxAP = Math.max(...apAging.map((a) => a.amount), 1);
  const trendLabel =
    foodCostTrendDeltaPct == null
      ? messages.inventory.reports.trendNotEnough
      : foodCostTrendDeltaPct > 0
        ? messages.inventory.reports.trendUp(
            formatPercent(foodCostTrendDeltaPct),
          )
        : foodCostTrendDeltaPct < 0
          ? messages.inventory.reports.trendDown(
              formatPercent(Math.abs(foodCostTrendDeltaPct)),
            )
          : messages.inventory.reports.trendStable;
  const reportCatalog = messages.inventory.reports.catalog.map(
    (report, index) => ({
      ...report,
      icon: [IconChartBar, IconTrendingUp, IconArrowLeftRight, IconPackage][
        index
      ]!,
    }),
  );
  const content = (
    <>
      <AppPageHeader
        title={messages.inventory.reports.pageTitle}
      />

      {/* Dashboard Grid — 12 col asymmetric */}
      <div className="grid grid-cols-12 gap-4">
        <AppSection
          className={cn(
            "col-span-12 flex flex-col",
            showSupplierPayables ? "lg:col-span-8" : "lg:col-span-12",
          )}
          title={messages.inventory.reports.movementTitle}
          icon={<IconChartBar />}
          contentClassName="flex flex-1 flex-col gap-4"
        >
          <div className="flex items-center justify-end">
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-chart-1" />
                <span className="text-muted-foreground">
                  {messages.inventory.reports.inbound}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-chart-2" />
                <span className="text-muted-foreground">
                  {messages.inventory.reports.transferIn}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-chart-4" />
                <span className="text-muted-foreground">
                  {messages.inventory.reports.outboundConsumption}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-chart-5" />
                <span className="text-muted-foreground">
                  {messages.inventory.reports.production}
                </span>
              </span>
            </div>
          </div>
          <div className="flex-1">
            <SimpleBarChart
              data={movementSummary}
              ariaLabel={messages.inventory.reports.movementTitle}
              formatValue={formatQuantity}
              height={220}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{trendLabel}</p>
            <Badge variant="outline">
              {messages.inventory.reports.currentMonthSnapshot}
            </Badge>
          </div>
        </AppSection>

        {showSupplierPayables ? (
          <AppSection
            className="col-span-12 lg:col-span-4"
            title={messages.inventory.reports.supplierPayables}
          >
            <div className="flex flex-col gap-3">
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
                      "rounded-md p-3",
                      isOverdue
                        ? "border border-destructive/20 bg-destructive/10"
                        : "bg-muted/50",
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
                          "font-semibold",
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
                        className="h-full rounded-full transition-[width,background-color]"
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
              className="w-full text-muted-foreground"
              render={<Link href="/finance/supplier-invoices" />}
            >
              {messages.inventory.reports.openSupplierDebt}
            </Button>
          </AppSection>
        ) : null}

        <AppSection
          className="col-span-12 md:col-span-6"
          title={messages.inventory.reports.consumptionVariance}
          description={messages.inventory.reports.recipeActualVsStandard}
        >
          <div className="flex flex-col gap-3">
            {consumptionVariance.map((item) => {
              const isUp = item.trend === "up";
              return (
                <Item
                  key={item.name}
                  variant="muted"
                  className="flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md bg-card">
                      <IconPackage className="size-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {messages.inventory.reports.unitKg}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold",
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
                </Item>
              );
            })}
          </div>
        </AppSection>

        <AppSection
          className="col-span-12 md:col-span-6"
          title={messages.inventory.reports.foodCostTrend}
          description={messages.inventory.reports.foodCostTarget}
        >
          {foodCostTrendAvailable ? (
            <>
              <TargetTrendSparkline
                data={foodCostTrend}
                ariaLabel={messages.inventory.reports.foodCostTrend}
                formatValue={formatPercent}
                width={400}
                height={120}
                color="primary"
                target={30}
                targetDescription={messages.inventory.reports.foodCostTarget}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {messages.inventory.reports.foodCostByMonth}
              </p>
            </>
          ) : (
            <AppEmptyState
              compact
              className="min-h-40"
              title={messages.inventory.reports.foodCostEmptyTitle}
              description={messages.inventory.reports.foodCostEmptyDescription}
            />
          )}
        </AppSection>
      </div>

      {/* Waste Analytics Cockpit */}
      <AppSection
        title={INVENTORY_VI.wasteAnalyticsTitle}
        icon={<IconChartBar />}
        contentClassName="flex flex-col gap-4"
      >
        <WasteAnalyticsCockpit data={wasteAnalytics} />
      </AppSection>

      {/* Report catalog */}
      <h2 className="font-heading text-base font-semibold tracking-tight">
        {messages.inventory.reports.detailTitle}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reportCatalog.map((report) => (
          <AppLinkCard
            key={report.title}
            href="#"
            title={report.title}
            description={report.desc}
            icon={<report.icon />}
            badge={messages.inventory.reports.comingSoon}
            badgeVariant="outline"
            disabled
          />
        ))}
      </div>
    </>
  );

  return (
    <AppPage width="xwide" density="compact" scroll>
      {content}
    </AppPage>
  );
}
