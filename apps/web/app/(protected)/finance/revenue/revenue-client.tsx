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
import { formatVND } from "@comtammatu/shared/format";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
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
const RevenueChartsBlock = dynamic(
  () => import("./revenue-charts-internal").then((m) => m.RevenueChartsBlock),
  {
    ssr: false,
    loading: () => (
      <>
        <Skeleton className="h-44 w-full rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="aspect-square max-h-72 w-full rounded-lg" />
          <Skeleton className="aspect-square max-h-72 w-full rounded-lg" />
        </div>
      </>
    ),
  },
);
import { ExportToolbar, type CsvSection } from "../components/export-toolbar";
import { FilterBar } from "../components/filter-bar";
import { HeatmapGrid, type HeatmapCell } from "../components/heatmap-grid";
import { KpiCard } from "@/components/kpi/kpi-card";
import { MvStalenessBanner } from "../components/mv-staleness-banner";
import { WorkQueueStrip } from "../components/work-queue-strip";
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
  canRefreshFinanceViews: boolean;
}

// ─── Aggregation helpers ────────────────────────────────────────

interface PeriodAggregateRow {
  period_start: string;
  period_end: string;
  period_label: string;
  order_count: number;
  /** Sum of orders.total_amount (post-discount, post-VAT — what customer paid) */
  total_revenue: number;
  /** Sum of orders.subtotal (PRE-discount, pre-VAT) */
  gross_sales: number;
  discount_amount: number;
  total_tax: number;
  cash_revenue: number;
  vietqr_revenue: number;
  momo_revenue: number;
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
      existing.momo_revenue += r.momo_revenue ?? 0;
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
        momo_revenue: r.momo_revenue ?? 0,
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

interface BranchAggregateRow {
  branchId: number;
  revenue: number;
  orders: number;
}

function aggregateByBranch(
  rows: RollupRow[],
  branches: AccessibleBranch[],
): Array<BranchAggregateRow & { name: string }> {
  const map = new Map<number, BranchAggregateRow>();
  for (const r of rows) {
    const existing = map.get(r.branch_id);
    // BA "Doanh thu thuần": gross_sales − discount_amount per branch
    const rev = (r.subtotal_revenue ?? 0) - (r.discount_amount ?? 0);
    if (existing) {
      existing.revenue += rev;
      existing.orders += r.order_count;
    } else {
      map.set(r.branch_id, {
        branchId: r.branch_id,
        revenue: rev,
        orders: r.order_count,
      });
    }
  }
  const branchName = (id: number) =>
    branches.find((b) => b.id === id)?.name ??
    messages.finance.common.branchFallback(id);
  return Array.from(map.values())
    .map((r) => ({ ...r, name: branchName(r.branchId) }))
    .sort((a, b) => b.revenue - a.revenue);
}

function bucketsToHeatmap(buckets: HourBucket[]): HeatmapCell[] {
  return buckets.map((b) => ({
    dow: b.dow,
    hour: b.hour,
    value: Number(b.net_revenue),
    orderCount: Number(b.order_count),
  }));
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
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
  canRefreshFinanceViews,
}: Props) {
  const periodRows = useMemo(() => aggregateByPeriod(rollupRows), [rollupRows]);
  const branchRows = useMemo(
    () => aggregateByBranch(rollupRows, branches),
    [rollupRows, branches],
  );
  const heatmapCells = useMemo(
    () => bucketsToHeatmap(hourBuckets),
    [hourBuckets],
  );

  // ─── KPI semantics (BA §1, Q1-Q3) ──────────────────────────
  //
  // RPC `get_revenue_kpis` field naming differs from BA contract:
  //   • RPC.subtotal_revenue = sum(orders.subtotal) = PRE-discount, PRE-VAT
  //     → this is what BA calls "gross_sales"
  //   • RPC.net_revenue = sum(orders.total_amount) = customer paid total
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
  const trendData = periodRows.map((r) => ({
    period: r.period_label,
    revenue: Math.round(netRevenuePreVatFor(r)),
  }));

  // ─── Sparkline data for hero KPI ───────────────────────────
  const sparkline = trendData.map((p, i) => ({
    x: String(i),
    y: p.revenue,
  }));

  // ─── Payment donut data ────────────────────────────────────
  const paymentTotal =
    (kpis?.cash_revenue ?? 0) +
    (kpis?.vietqr_revenue ?? 0) +
    (kpis?.momo_revenue ?? 0);
  const paymentData = [
    {
      key: "cash",
      label: filterCopy.paymentCash.replace("Chỉ ", ""),
      value: kpis?.cash_revenue ?? 0,
    },
    {
      key: "vietqr",
      label: "VietQR",
      value: kpis?.vietqr_revenue ?? 0,
    },
    {
      key: "momo",
      label: "MoMo",
      value: kpis?.momo_revenue ?? 0,
    },
  ];

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
        revCopy.csvHeaders.colMomo,
        revCopy.csvHeaders.colVat,
      ],
      rows: periodRows.map((r) => [
        r.period_label,
        r.order_count,
        Math.round(netRevenuePreVatFor(r)),
        Math.round(r.cash_revenue),
        Math.round(r.vietqr_revenue),
        Math.round(r.momo_revenue),
        Math.round(r.total_tax),
      ]),
      footer: kpis
        ? [
            revCopy.csvHeaders.total,
            kpis.order_count,
            Math.round(netRevenuePreVat),
            Math.round(kpis.cash_revenue),
            Math.round(kpis.vietqr_revenue),
            Math.round(kpis.momo_revenue),
            Math.round(kpis.total_tax),
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
        revCopy.csvHeaders.colQrMomo,
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
      render: (row) => row.order_count.toLocaleString("vi-VN"),
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
      header: "VietQR",
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.vietqr_revenue),
    },
    {
      key: "momo",
      header: "MoMo",
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.momo_revenue),
    },
    {
      key: "vat",
      header: revCopy.periodTable.colVat,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.total_tax),
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
          content: (kpis?.order_count ?? 0).toLocaleString("vi-VN"),
          className: "text-right font-mono tabular-nums font-medium",
        },
        {
          key: "net",
          content: formatVND(netRevenuePreVat),
          className: "text-right font-mono tabular-nums font-bold",
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
          key: "momo",
          content: formatVND(kpis?.momo_revenue ?? 0),
          className: "text-right font-mono tabular-nums",
        },
        {
          key: "tax",
          content: formatVND(kpis?.total_tax ?? 0),
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
      render: (row) => Number(row.order_count).toLocaleString("vi-VN"),
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
      render: (row) => Number(row.quantity_sold).toLocaleString("vi-VN"),
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
        eyebrow={revCopy.page.eyebrow}
        title={revCopy.page.title}
        description={revCopy.page.description}
        meta={revCopy.page.meta(
          branchLabel,
          `${resolvedStart} → ${resolvedEnd}`,
          granularityLabel,
        )}
        actions={
          <ExportToolbar
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

      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/revenue"
        hide={["payment"]}
      />

      <MvStalenessBanner
        lastRefreshAt={kpis?.refreshed_at ?? null}
        canRefresh={canRefreshFinanceViews}
      />

      <SectionHeading
        title={revCopy.sections.keyMetricsTitle}
        description={revCopy.sections.keyMetricsDescription}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={revCopy.kpi.netRevenue}
          value={formatVND(netRevenuePreVat)}
          tone="primary"
          hint={revCopy.kpi.netRevenueHint}
          delta={delta(netRevenuePreVat, prevNetPreVat, "higher_better")}
          sparkline={sparkline.length > 0 ? sparkline : undefined}
          sparklineLabel={revCopy.trendChart.sparklineLabel}
        />
        <KpiCard
          label={revCopy.kpi.totalCollected}
          value={formatVND(kpis?.net_revenue ?? 0)}
          hint={revCopy.kpi.totalCollectedHint(formatVND(kpis?.total_tax ?? 0))}
          delta={delta(
            kpis?.net_revenue ?? 0,
            prev?.net_revenue ?? 0,
            "higher_better",
          )}
        />
        <KpiCard
          label={revCopy.kpi.orderCount}
          value={(kpis?.order_count ?? 0).toLocaleString("vi-VN")}
          hint={revCopy.kpi.orderCountHint}
          delta={delta(
            kpis?.order_count ?? 0,
            prev?.order_count ?? 0,
            "higher_better",
          )}
        />
        <KpiCard
          label={revCopy.kpi.aovOrder}
          value={aovPerOrder > 0 ? formatVND(aovPerOrder) : "—"}
          hint={revCopy.kpi.aovOrderHint}
          delta={delta(aovPerOrder, prevAovOrder, "higher_better")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label={revCopy.kpi.discountRate}
          value={`${discountPct.toFixed(1)}%`}
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
          value={`${voidedPct.toFixed(1)}%`}
          hint={
            kpis
              ? revCopy.kpi.voidHint(
                  formatVND(kpis.voided_amount),
                  kpis.voided_count,
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
      </div>

      {/* Compare period footnote */}
      {compare ? (
        <p className="text-xs text-muted-foreground">
          {revCopy.compare.periodLabel} {compare.start} → {compare.end}
          {prev ? null : revCopy.compare.noPrevData}
        </p>
      ) : null}

      <SectionHeading
        title={revCopy.sections.chartTitle}
        description={revCopy.sections.chartDescription}
      />

      <RevenueChartsBlock
        trendData={trendData}
        resolvedStart={resolvedStart}
        resolvedEnd={resolvedEnd}
        granularityLabel={granularityLabel}
        paymentData={paymentData}
        paymentTotal={paymentTotal}
        branchRows={branchRows}
        branchActive={params.branch != null}
      />

      <AppSection
        title={revCopy.heatmap.title}
        description={
          hourlyEnabled
            ? revCopy.heatmap.description
            : revCopy.heatmap.tooLargeRange
        }
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

      <SectionHeading
        title={revCopy.sections.tableTitle}
        description={revCopy.sections.tableDescription}
      />

      <AppSection
        title={revCopy.periodTable.title}
        description={
          params.branch == null
            ? revCopy.periodTable.descriptionAll
            : revCopy.periodTable.descriptionSingle
        }
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
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>
                    {href ? (
                      <Link
                        href={href}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {row.period_label}
                      </Link>
                    ) : (
                      row.period_label
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {row.order_count.toLocaleString("vi-VN")}{" "}
                    {revCopy.periodTable.colOrders}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <span className="text-xs text-muted-foreground">
                    {revCopy.periodTable.colVat}: {formatVND(row.total_tax)}
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
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{revCopy.periodTable.total}</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatVND(netRevenuePreVat)}
              </span>
            </div>
          }
        />
      </AppSection>

      {/* Cashier table + Top items table */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AppSection
          title={revCopy.cashierTable.title}
          description={
            cashierEnabled
              ? revCopy.cashierTable.description
              : revCopy.cashierTable.tooLargeRange
          }
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
                    {Number(row.order_count).toLocaleString("vi-VN")}{" "}
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
          description={revCopy.topItems.description}
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
                    {Number(row.quantity_sold).toLocaleString("vi-VN")}{" "}
                    {revCopy.topItems.colQty}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <span className="text-xs text-muted-foreground">
                    CN #{row.branch_id}
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

      <SectionHeading
        title={revCopy.sections.controlTitle}
        description={revCopy.sections.controlDescription}
      />

      <WorkQueueStrip
        summary={dashboardSummary}
        health={dashboardHealth}
        hide={["foodCost", "webhook"]}
      />

      {cashVariance ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <CashVarianceCard variance={cashVariance} />
        </div>
      ) : null}
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
    <AppSection title={cashCopy.title} description={cashCopy.description}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {cashCopy.closedSessions}
          </p>
          <p className="text-lg font-semibold font-mono tabular-nums">
            {variance.session_count.toLocaleString("vi-VN")}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{cashCopy.netVariance}</p>
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
          <SectionLabel>
            {cashCopy.topVariance}
          </SectionLabel>
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
