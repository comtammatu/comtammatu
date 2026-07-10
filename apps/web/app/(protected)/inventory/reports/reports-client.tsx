"use client";

import Link from "next/link";
import {
  ChartBar as IconChartBar,
  TrendingUp as IconTrendingUp,
  ArrowLeftRight as IconArrowLeftRight,
  Package as IconPackage,
} from "lucide-react";
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
  supplierInvoicesHref?: string | null;
  embedded?: boolean;
};

export function ReportsClient({
  movementSummary,
  apAging,
  consumptionVariance,
  foodCostTrend,
  foodCostTrendAvailable,
  foodCostTrendDeltaPct,
  supplierInvoicesHref = "/inventory/supplier-invoices",
  embedded = false,
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
  const showSupplierPayables = supplierInvoicesHref != null;
  const content = (
    <>
      {!embedded ? (
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={messages.inventory.reports.pageTitle}
        />
      ) : null}

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
            <SimpleBarChart data={movementSummary} height={220} />
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
              asChild
              type="button"
              variant="outline"
              className="w-full text-muted-foreground"
            >
              <Link href={supplierInvoicesHref}>
                {messages.inventory.reports.openSupplierDebt}
              </Link>
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
                      <p className="truncate text-sm font-bold text-foreground">
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
            <AppEmptyState
              compact
              className="min-h-40"
              title={messages.inventory.reports.foodCostEmptyTitle}
              description={messages.inventory.reports.foodCostEmptyDescription}
            />
          )}
        </AppSection>
      </div>

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

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" density="compact" scroll>
      {content}
    </AppPage>
  );
}
