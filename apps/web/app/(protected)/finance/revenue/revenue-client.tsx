"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Badge } from "@comtammatu/ui/components/badge";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  formatAccountingVND as formatVND,
  formatCompactVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFooterRow,
} from "@/components/data-table/data-table";
import type { FinanceDashboardSummary } from "../actions";
import type { FinanceDashboardHealth, TopItemRow } from "../_lib/finance-types";
import type { FinanceParams } from "../_lib/finance-params";
import {
  buildCompareDelta,
  type CompareDelta,
} from "@/components/kpi/compare-chip";

// Recharts is the heaviest dependency on this route (~95 KB gz). Defer it
// to a dynamic chunk so KPI cards + work queue strip render before the
// chart code arrives. ssr:false matches the trend-sparkline pattern —
// Recharts uses ResizeObserver/useState which mismatch hydration.
const RevenueCharts = dynamic(
  () => import("./revenue-charts-internal").then((m) => m.RevenueCharts),
  {
    ssr: false,
    loading: () => <Skeleton className="h-44 w-full rounded-lg" />,
  },
);
import {
  FinanceExportActions,
  type CsvSection,
} from "../components/export-toolbar";
import { FilterBar } from "../components/filter-bar";
import { HeatmapGrid, type HeatmapCell } from "../components/heatmap-grid";
import { KpiCard } from "@/components/kpi/kpi-card";
import { WorkQueueStrip } from "../components/work-queue-strip";
import { BranchTargetCompetition } from "../components/branch-target-competition";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { messages } from "@lib/messages";
import type {
  AccessibleBranch,
  CashVarianceSummary,
  CashierRow,
  ComparePeriod,
  HourBucket,
  KpiBundle,
  RollupRow,
} from "./_lib/finance-types-revenue";
import type { BranchRevenueTargetProgressRow } from "../targets/actions";
import {
  daysInMonthFromStart,
  monthStartFromIsoDate,
  paceTargetAmount,
} from "../_lib/revenue-target";

const filterCopy = messages.finance.filterBar;
const revCopy = messages.finance.revenue;
const cashCopy = messages.finance.cashVarianceCard;

interface Props {
  params: FinanceParams;
  branches: AccessibleBranch[];
  kpis: KpiBundle | null;
  compare: ComparePeriod | null;
  rollupRows: RollupRow[];
  topItems: TopItemRow[];
  hourBuckets: HourBucket[];
  hourlyEnabled: boolean;
  cashierEnabled: boolean;
  cashiers: CashierRow[];
  cashVariance: CashVarianceSummary | null;
  dashboardSummary: FinanceDashboardSummary | null;
  dashboardHealth: FinanceDashboardHealth;
  resolvedStart: string;
  resolvedEnd: string;
  targetRows: BranchRevenueTargetProgressRow[];
  showTargetMonth: boolean;
}

// ─── Aggregation helpers ────────────────────────────────────────

interface PeriodAggregateRow {
  period_start: string;
  period_end: string;
  period_label: string;
  order_count: number;
  /** Sum of payments.amount (post-discount, post-VAT — money collected) */
  total_revenue: number;
  /** Sum of orders.subtotal (PRE-discount, pre-VAT) */
  gross_sales: number;
  discount_amount: number;
  total_tax: number;
  cash_revenue: number;
  vietqr_revenue: number;
  platform_revenue: number;
  delivery_revenue: number;
  branch_ids: number[];
}

function aggregateByPeriod(rows: RollupRow[]): PeriodAggregateRow[] {
  const map = new Map<string, PeriodAggregateRow>();
  for (const r of rows) {
    const key = `${r.period_start}|${r.period_end}`;
    const existing = map.get(key);
    if (existing) {
      existing.order_count += r.order_count;
      existing.total_revenue += r.total_revenue ?? 0;
      existing.gross_sales += r.subtotal_revenue ?? 0;
      existing.discount_amount += r.discount_amount ?? 0;
      existing.total_tax += r.total_tax ?? 0;
      existing.cash_revenue += r.cash_revenue ?? 0;
      existing.vietqr_revenue += r.vietqr_revenue ?? 0;
      existing.platform_revenue += r.platform_revenue ?? 0;
      existing.delivery_revenue += r.delivery_revenue ?? 0;
      if (!existing.branch_ids.includes(r.branch_id)) {
        existing.branch_ids.push(r.branch_id);
      }
    } else {
      map.set(key, {
        period_start: r.period_start,
        period_end: r.period_end,
        period_label: r.period_label,
        order_count: r.order_count,
        total_revenue: r.total_revenue ?? 0,
        gross_sales: r.subtotal_revenue ?? 0,
        discount_amount: r.discount_amount ?? 0,
        total_tax: r.total_tax ?? 0,
        cash_revenue: r.cash_revenue ?? 0,
        vietqr_revenue: r.vietqr_revenue ?? 0,
        platform_revenue: r.platform_revenue ?? 0,
        delivery_revenue: r.delivery_revenue ?? 0,
        branch_ids: [r.branch_id],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
}

/** BA "Doanh thu thuần" per period: gross_sales − discount_amount */
function netRevenuePreVatFor(r: PeriodAggregateRow): number {
  return r.gross_sales - r.discount_amount;
}

function bucketsToHeatmap(buckets: HourBucket[]): HeatmapCell[] {
  return buckets.map((b) => ({
    dow: b.dow,
    hour: b.hour,
    value: Number(b.net_revenue),
    orderCount: Number(b.order_count),
  }));
}

// ─── Component ─────────────────────────────────────────────────

export function RevenueClient({
  params,
  branches,
  kpis,
  compare,
  rollupRows,
  topItems,
  hourBuckets,
  hourlyEnabled,
  cashierEnabled,
  cashiers,
  cashVariance,
  dashboardSummary,
  dashboardHealth,
  resolvedStart,
  resolvedEnd,
  targetRows,
  showTargetMonth,
}: Props) {
  const periodRows = useMemo(() => aggregateByPeriod(rollupRows), [rollupRows]);
  const heatmapCells = useMemo(
    () => bucketsToHeatmap(hourBuckets),
    [hourBuckets],
  );

  // ─── KPI semantics (BA §1, Q1-Q3) ──────────────────────────
  //
  // RPC `get_revenue_kpis` field naming differs from BA contract:
  //   • RPC.subtotal_revenue = sum(orders.subtotal) = PRE-discount, PRE-VAT
  //     → this is what BA calls "gross_sales"
  //   • RPC.net_revenue = sum(payments.amount) = money collected
  //     (post-discount, post-VAT)
  //
  // BA hero "Doanh thu thuần" = post-discount, PRE-VAT = gross - discount
  // Equivalent: net_revenue - total_tax (when discount accounted in net).
  const grossSales = kpis?.subtotal_revenue ?? 0; // pre-discount, pre-VAT
  const netRevenuePreVat = grossSales - (kpis?.discount_amount ?? 0); // BA hero
  const aovPerOrder =
    kpis && kpis.order_count > 0
      ? Math.round(netRevenuePreVat / kpis.order_count)
      : 0;
  const discountPct =
    grossSales > 0 ? ((kpis?.discount_amount ?? 0) / grossSales) * 100 : 0;
  const voidedPct =
    grossSales > 0 ? ((kpis?.voided_amount ?? 0) / grossSales) * 100 : 0;

  // Compare deltas — null when compare is off.
  const prev = compare?.kpis ?? null;
  const prevGross = prev?.subtotal_revenue ?? 0;
  const prevNetPreVat = prevGross - (prev?.discount_amount ?? 0);
  const prevAovOrder =
    prev && prev.order_count > 0
      ? Math.round(prevNetPreVat / prev.order_count)
      : 0;
  const prevDiscountPct =
    prevGross > 0 ? ((prev?.discount_amount ?? 0) / prevGross) * 100 : 0;
  const prevVoidedPct =
    prevGross > 0 ? ((prev?.voided_amount ?? 0) / prevGross) * 100 : 0;

  function delta(
    current: number,
    previous: number,
    kind: "higher_better" | "lower_better",
  ): CompareDelta | null {
    if (!compare) return null;
    return buildCompareDelta(current, previous, kind);
  }

  // ─── Trend chart data (line) ───────────────────────────────
  const monthStart = monthStartFromIsoDate(resolvedStart);
  const daysInMonth = daysInMonthFromStart(monthStart);
  const paceTarget =
    showTargetMonth && params.branch != null
      ? (targetRows.find((row) => row.branchId === params.branch)
          ?.targetAmount ?? null)
      : showTargetMonth
        ? targetRows
            .filter((row) => row.targetAmount != null)
            .reduce((sum, row) => sum + (row.targetAmount ?? 0), 0) || null
        : null;
  const showPace = paceTarget != null && params.gran === "day";

  let cumulative = 0;
  const trendData = periodRows.map((r, index) => {
    const dayRevenue = Math.round(netRevenuePreVatFor(r));
    cumulative += dayRevenue;
    const dayIndex = index + 1;
    return {
      period: r.period_label,
      revenue: showPace ? cumulative : dayRevenue,
      pace: showPace
        ? Math.round(paceTargetAmount(paceTarget, dayIndex, daysInMonth))
        : null,
    };
  });

  // ─── Sparkline data for hero KPI (always daily, non-cumulative) ─
  const sparkline = periodRows.map((r, i) => ({
    x: String(i),
    y: Math.round(netRevenuePreVatFor(r)),
  }));

  // ─── Filter signature for CSV export ───────────────────────
  const branchLabel =
    params.branch == null
      ? messages.finance.common.allBranches
      : (branches.find((b) => b.id === params.branch)?.name ??
        messages.finance.common.branchFallback(params.branch));
  const granularityLabel =
    params.gran === "day"
      ? filterCopy.granularityDay
      : params.gran === "week"
        ? filterCopy.granularityWeek
        : filterCopy.granularityMonth;

  const csvSections: CsvSection[] = [
    {
      title: revCopy.csvHeaders.periodSection,
      header: [
        revCopy.csvHeaders.colPeriod,
        revCopy.csvHeaders.colOrders,
        revCopy.csvHeaders.colNetRevenue,
        revCopy.csvHeaders.colCash,
        revCopy.csvHeaders.colVietqr,
        revCopy.csvHeaders.colPlatform,
        revCopy.csvHeaders.colDelivery,
      ],
      rows: periodRows.map((r) => [
        r.period_label,
        r.order_count,
        Math.round(netRevenuePreVatFor(r)),
        Math.round(r.cash_revenue),
        Math.round(r.vietqr_revenue),
        Math.round(r.platform_revenue),
        Math.round(r.delivery_revenue),
      ]),
      footer: kpis
        ? [
            revCopy.csvHeaders.total,
            kpis.order_count,
            Math.round(netRevenuePreVat),
            Math.round(kpis.cash_revenue),
            Math.round(kpis.vietqr_revenue),
            Math.round(kpis.platform_revenue),
            Math.round(kpis.delivery_revenue),
          ]
        : undefined,
    },
  ];

  if (cashiers.length > 0) {
    csvSections.push({
      title: revCopy.csvHeaders.cashierSection,
      header: [
        revCopy.csvHeaders.colCashier,
        revCopy.csvHeaders.colOrders,
        revCopy.csvHeaders.colNetRevenue,
        revCopy.csvHeaders.colCash,
        revCopy.csvHeaders.colQr,
      ],
      rows: cashiers.map((c) => [
        c.cashier_name,
        Number(c.order_count),
        Math.round(Number(c.net_revenue)),
        Math.round(Number(c.cash_revenue)),
        Math.round(Number(c.qr_revenue)),
      ]),
    });
  }

  const branchSlug = params.branch == null ? "all" : `cn-${params.branch}`;
  const csvFilename = `doanh-thu-${branchSlug}-${resolvedStart}_${resolvedEnd}`;

  function periodDrillHref(row: PeriodAggregateRow): string | null {
    const drillBranchId =
      params.branch != null
        ? params.branch
        : row.branch_ids.length === 1
          ? row.branch_ids[0]
          : null;
    if (params.gran !== "day" || drillBranchId == null) return null;
    return `/finance/revenue/${row.period_start}?branch=${drillBranchId}`;
  }

  const periodColumns: DataTableColumn<PeriodAggregateRow>[] = [
    {
      key: "period",
      header: revCopy.periodTable.colPeriod,
      className: "font-medium font-mono tabular-nums",
      render: (row) => {
        const href = periodDrillHref(row);
        return href ? (
          <Link
            href={href}
            className="text-primary underline-offset-2 hover:underline"
          >
            {row.period_label}
          </Link>
        ) : (
          row.period_label
        );
      },
    },
    {
      key: "orders",
      header: revCopy.periodTable.colOrders,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatCount(row.order_count),
    },
    {
      key: "net_revenue",
      header: revCopy.periodTable.colNetRevenue,
      className: "text-right font-mono tabular-nums font-medium",
      render: (row) => formatVND(netRevenuePreVatFor(row)),
    },
    {
      key: "cash",
      header: revCopy.periodTable.colCash,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.cash_revenue),
    },
    {
      key: "vietqr",
      header: revCopy.periodTable.colVietqr,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.vietqr_revenue),
    },
    {
      key: "platform",
      header: revCopy.periodTable.colPlatform,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.platform_revenue),
    },
    {
      key: "delivery",
      header: revCopy.periodTable.colDelivery,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.delivery_revenue),
    },
  ];

  const periodFooterRows: DataTableFooterRow[] = [
    {
      key: "total",
      className: "hover:bg-transparent",
      cells: [
        {
          key: "label",
          content: revCopy.periodTable.total,
          className: "font-medium",
        },
        {
          key: "orders",
          content: formatCount(kpis?.order_count ?? 0),
          className: "text-right font-mono tabular-nums font-medium",
        },
        {
          key: "net",
          content: formatVND(netRevenuePreVat),
          className: "text-right font-mono tabular-nums font-semibold",
        },
        {
          key: "cash",
          content: formatVND(kpis?.cash_revenue ?? 0),
          className: "text-right font-mono tabular-nums",
        },
        {
          key: "vietqr",
          content: formatVND(kpis?.vietqr_revenue ?? 0),
          className: "text-right font-mono tabular-nums",
        },
        {
          key: "platform",
          content: formatVND(kpis?.platform_revenue ?? 0),
          className: "text-right font-mono tabular-nums",
        },
        {
          key: "delivery",
          content: formatVND(kpis?.delivery_revenue ?? 0),
          className: "text-right font-mono tabular-nums",
        },
      ],
    },
  ];

  const cashierRows = cashiers.slice(0, 8);
  const cashierColumns: DataTableColumn<CashierRow>[] = [
    {
      key: "cashier",
      header: revCopy.cashierTable.colCashier,
      className: "font-medium",
      render: (row) => row.cashier_name,
    },
    {
      key: "orders",
      header: revCopy.cashierTable.colOrders,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatCount(Number(row.order_count)),
    },
    {
      key: "net",
      header: revCopy.cashierTable.colNetRevenue,
      className: "text-right font-mono tabular-nums font-medium",
      render: (row) => formatVND(Number(row.net_revenue)),
    },
    {
      key: "cash",
      header: revCopy.cashierTable.colCash,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(Number(row.cash_revenue)),
    },
  ];

  const topItemRows = topItems.slice(0, 8);
  const topItemColumns: DataTableColumn<TopItemRow>[] = [
    {
      key: "name",
      header: revCopy.topItems.colName,
      className: "font-medium",
      render: (row) => row.item_name,
    },
    {
      key: "qty",
      header: revCopy.topItems.colQty,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatCount(Number(row.quantity_sold)),
    },
    {
      key: "revenue",
      header: revCopy.topItems.colRevenue,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(row.revenue),
    },
  ];

  // ─── Render ────────────────────────────────────────────────
  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={revCopy.page.title}
        meta={revCopy.page.meta(
          branchLabel,
          `${resolvedStart} → ${resolvedEnd}`,
          granularityLabel,
        )}
        actions={
          <FinanceExportActions
            filename={csvFilename}
            signature={{
              branchLabel,
              rangeLabel: `${resolvedStart} → ${resolvedEnd}`,
              granularityLabel,
            }}
            sections={csvSections}
          />
        }
      />

      {/* DASHBOARD_REPORT: non-sticky FilterBar above KPI — never wrap cockpit in AppListFrame. */}
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/revenue"
        hide={["branch"]}
      />

      <KpiRow density="compact" className="lg:grid-cols-4">
        <KpiCard
          label={revCopy.kpi.netRevenue}
          value={formatVND(netRevenuePreVat)}
          shortValue={formatCompactVND(netRevenuePreVat)}
          tone="primary"
          delta={delta(netRevenuePreVat, prevNetPreVat, "higher_better")}
          sparkline={sparkline.length > 0 ? sparkline : undefined}
          sparklineLabel={revCopy.trendChart.sparklineLabel}
        />
        <KpiCard
          label={revCopy.kpi.totalCollected}
          value={formatVND(kpis?.net_revenue ?? 0)}
          shortValue={formatCompactVND(kpis?.net_revenue ?? 0)}
          delta={delta(
            kpis?.net_revenue ?? 0,
            prev?.net_revenue ?? 0,
            "higher_better",
          )}
        />
        <KpiCard
          label={revCopy.kpi.orderCount}
          value={formatCount(kpis?.order_count ?? 0)}
          delta={delta(
            kpis?.order_count ?? 0,
            prev?.order_count ?? 0,
            "higher_better",
          )}
        />
        <KpiCard
          label={revCopy.kpi.aovOrder}
          value={aovPerOrder > 0 ? formatVND(aovPerOrder) : "—"}
          shortValue={
            aovPerOrder > 0 ? formatCompactVND(aovPerOrder) : undefined
          }
          delta={delta(aovPerOrder, prevAovOrder, "higher_better")}
        />
      </KpiRow>

      {/* Compare period footnote */}
      {compare ? (
        <p className="text-xs text-muted-foreground">
          {revCopy.compare.periodLabel} {compare.start} → {compare.end}
          {prev ? null : revCopy.compare.noPrevData}
        </p>
      ) : null}

      <AppPageTabs
        items={[
          { value: "overview", label: revCopy.tabs.overview },
          { value: "analysis", label: revCopy.tabs.analysis },
          { value: "control", label: revCopy.tabs.control },
        ]}
        defaultValue="overview"
      >
        <TabsContent value="overview" className="flex flex-col gap-4">
          {showTargetMonth && targetRows.length > 1 ? (
            <BranchTargetCompetition rows={targetRows} params={params} />
          ) : null}
          <RevenueCharts
            trendData={trendData}
            showPace={showPace}
          />

          <AppSection
            title={revCopy.periodTable.title}
            contentFlush
            contentScroll
          >
            <DataTable
              columns={periodColumns}
              data={periodRows}
              getRowKey={(row) => row.period_start}
              emptyTitle={revCopy.periodTable.empty}
              mobileCardRender={(row) => {
                const href = periodDrillHref(row);
                return (
                  <Item
                    variant="outline"
                    render={href ? <Link href={href} /> : undefined}
                  >
                    <ItemContent>
                      <ItemTitle>
                        <span
                          className={
                            href
                              ? "text-primary underline-offset-2 group-hover/item:underline"
                              : undefined
                          }
                        >
                          {row.period_label}
                        </span>
                      </ItemTitle>
                      <ItemDescription>
                        {formatCount(row.order_count)}{" "}
                        {revCopy.periodTable.colOrders} ·{" "}
                        {revCopy.periodTable.colCash}:{" "}
                        {formatVND(row.cash_revenue)} ·{" "}
                        {revCopy.periodTable.colVietqr}:{" "}
                        {formatVND(row.vietqr_revenue)} ·{" "}
                        {revCopy.periodTable.colPlatform}:{" "}
                        {formatVND(row.platform_revenue)} ·{" "}
                        {revCopy.periodTable.colDelivery}:{" "}
                        {formatVND(row.delivery_revenue)}
                      </ItemDescription>
                    </ItemContent>
                    <ItemFooter>
                      <span className="text-xs text-muted-foreground">
                        {revCopy.periodTable.colCash}:{" "}
                        {formatVND(row.cash_revenue)}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {formatVND(netRevenuePreVatFor(row))}
                      </span>
                    </ItemFooter>
                  </Item>
                );
              }}
              desktopFooterRows={periodFooterRows}
              mobileFooter={
                <Frame className="flex items-center justify-between bg-muted/30 p-3 text-sm">
                  <span className="font-medium">
                    {revCopy.periodTable.total}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatVND(netRevenuePreVat)}
                  </span>
                </Frame>
              }
            />
          </AppSection>
        </TabsContent>

        <TabsContent value="analysis" className="flex flex-col gap-4">
          <KpiRow density="compact">
            <KpiCard
              label={revCopy.kpi.discountRate}
              value={formatPercent(discountPct)}
              hint={kpis ? formatVND(kpis.discount_amount) : "—"}
              tone={
                discountPct >= 15
                  ? "destructive"
                  : discountPct >= 8
                    ? "warning"
                    : "neutral"
              }
              delta={delta(discountPct, prevDiscountPct, "lower_better")}
            />
            <KpiCard
              label={revCopy.kpi.voidRate}
              value={formatPercent(voidedPct)}
              hint={
                kpis
                  ? revCopy.kpi.voidHint(
                      formatVND(kpis.voided_amount),
                      formatCount(kpis.voided_count),
                    )
                  : "—"
              }
              tone={
                voidedPct >= 5
                  ? "destructive"
                  : voidedPct >= 3
                    ? "warning"
                    : "neutral"
              }
              delta={delta(voidedPct, prevVoidedPct, "lower_better")}
            />
          </KpiRow>

          <AppSection
            title={revCopy.heatmap.title}
          >
            {hourlyEnabled && heatmapCells.length > 0 ? (
              <HeatmapGrid cells={heatmapCells} />
            ) : (
              <AppEmptyState
                compact
                className="h-32 border-dashed bg-transparent py-0"
                title={
                  hourlyEnabled
                    ? revCopy.heatmap.empty
                    : revCopy.heatmap.tooLargeEmpty
                }
              />
            )}
          </AppSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <AppSection
              title={revCopy.cashierTable.title}
              contentFlush
              contentScroll
            >
              <DataTable
                columns={cashierColumns}
                data={cashierRows}
                getRowKey={(row) => row.cashier_id ?? row.cashier_name}
                emptyTitle={
                  cashierEnabled
                    ? revCopy.cashierTable.empty
                    : revCopy.cashierTable.tooLargeEmpty
                }
                mobileCardRender={(row) => (
                  <Item variant="outline">
                    <ItemContent>
                      <ItemTitle>{row.cashier_name}</ItemTitle>
                      <ItemDescription>
                        {formatCount(Number(row.order_count))}{" "}
                        {revCopy.cashierTable.colOrders}
                      </ItemDescription>
                    </ItemContent>
                    <ItemFooter>
                      <span className="text-xs text-muted-foreground">
                        {revCopy.cashierTable.colCash}:{" "}
                        {formatVND(Number(row.cash_revenue))}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {formatVND(Number(row.net_revenue))}
                      </span>
                    </ItemFooter>
                  </Item>
                )}
              />
            </AppSection>

            <AppSection
              title={revCopy.topItems.title}
              contentFlush
              contentScroll
            >
              <DataTable
                columns={topItemColumns}
                data={topItemRows}
                getRowKey={(row) => `${row.branch_id}-${row.menu_item_id}`}
                emptyTitle={revCopy.topItems.empty}
                mobileCardRender={(row) => (
                  <Item variant="outline">
                    <ItemContent>
                      <ItemTitle>{row.item_name}</ItemTitle>
                      <ItemDescription>
                        {formatCount(Number(row.quantity_sold))}{" "}
                        {revCopy.topItems.colQty}
                      </ItemDescription>
                    </ItemContent>
                    <ItemFooter>
                      <span className="text-xs text-muted-foreground">
                        {revCopy.topItems.colRevenue}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {formatVND(row.revenue)}
                      </span>
                    </ItemFooter>
                  </Item>
                )}
              />
            </AppSection>
          </div>
        </TabsContent>

        <TabsContent value="control" className="flex flex-col gap-4">
          <WorkQueueStrip
            summary={dashboardSummary}
            health={dashboardHealth}
            hide={["foodCost", "webhook"]}
            scope={params}
            cashVarianceHref={
              cashVariance && params.branch != null
                ? `/br/${String(params.branch)}/pos-sessions`
                : undefined
            }
          />

          {cashVariance ? <CashVarianceCard variance={cashVariance} /> : null}
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}

// ─── Sub-components (preserved from previous client) ────────────

function CashVarianceCard({ variance }: { variance: CashVarianceSummary }) {
  const hasShortPattern = variance.short_count >= 3;
  const tone =
    variance.abs_variance_total === 0
      ? "good"
      : hasShortPattern
        ? "bad"
        : "warn";
  return (
    <AppSection title={cashCopy.title}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {cashCopy.closedSessions}
          </p>
          <p className="text-lg font-semibold font-mono tabular-nums">
            {formatCount(variance.session_count)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {cashCopy.netVariance}
          </p>
          <p
            className={
              tone === "good"
                ? "text-lg font-semibold font-mono tabular-nums text-success"
                : tone === "bad"
                  ? "text-lg font-semibold font-mono tabular-nums text-destructive"
                  : "text-lg font-semibold font-mono tabular-nums text-warning"
            }
          >
            {variance.total_variance >= 0 ? "+" : ""}
            {formatVND(variance.total_variance)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {cashCopy.short(variance.short_count)}
          </p>
          <p className="text-lg font-semibold font-mono tabular-nums text-destructive">
            {formatVND(variance.short_total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {cashCopy.over(variance.over_count)}
          </p>
          <p className="text-lg font-semibold font-mono tabular-nums text-success">
            +{formatVND(variance.over_total)}
          </p>
        </div>
      </div>
      {variance.worst_cashiers.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <SectionLabel>{cashCopy.topVariance}</SectionLabel>
          <ul className="flex flex-col gap-1">
            {variance.worst_cashiers.map((c) => (
              <li
                key={c.cashier_id ?? c.cashier_name}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate">
                  {c.cashier_name}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {cashCopy.sessionCount(c.session_count)}
                  </Badge>
                </span>
                <span
                  className={
                    c.net_variance < 0
                      ? "tabular-nums text-destructive"
                      : "tabular-nums text-success"
                  }
                >
                  {c.net_variance >= 0 ? "+" : ""}
                  {formatVND(c.net_variance)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {cashCopy.noVariance}
        </p>
      )}
    </AppSection>
  );
}
