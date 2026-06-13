"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Badge } from "@comtammatu/ui/components/badge";
import { formatVND } from "@comtammatu/shared/format";
import { AppPage, AppPageHeader } from "@/components/surface";
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
        <div className="h-[180px] w-full animate-pulse rounded-md bg-muted/40" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="aspect-square max-h-72 w-full animate-pulse rounded-md bg-muted/40" />
          <div className="aspect-square max-h-72 w-full animate-pulse rounded-md bg-muted/40" />
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
import { messages } from "@lib/messages";
import type {
  AccessibleBranch,
  CashVarianceSummary,
  CashierRow,
  ComparePeriod,
  HourBucket,
  KpiBundle,
  RollupRow,
} from "./page";

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
  invoiceAttentionCount: number;
  resolvedStart: string;
  resolvedEnd: string;
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
  total_covers: number;
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
      existing.total_covers += r.total_covers;
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
        total_covers: r.total_covers,
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
    <div className="space-y-1">
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
  invoiceAttentionCount,
  resolvedStart,
  resolvedEnd,
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
  const aovPerCover =
    kpis && kpis.total_covers > 0
      ? Math.round(netRevenuePreVat / kpis.total_covers)
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
  const prevAovCover =
    prev && prev.total_covers > 0
      ? Math.round(prevNetPreVat / prev.total_covers)
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
        revCopy.csvHeaders.colCustomers,
        revCopy.csvHeaders.colNetRevenue,
        revCopy.csvHeaders.colCash,
        revCopy.csvHeaders.colVietqr,
        revCopy.csvHeaders.colMomo,
        revCopy.csvHeaders.colVat,
      ],
      rows: periodRows.map((r) => [
        r.period_label,
        r.order_count,
        r.total_covers,
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
            kpis.total_covers,
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

  // ─── Render ────────────────────────────────────────────────
  return (
    <AppPage width="wide" density="compact">
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

      <MvStalenessBanner lastRefreshAt={kpis?.refreshed_at ?? null} />

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
          hint={revCopy.kpi.orderCountHint(
            (kpis?.total_covers ?? 0).toLocaleString("vi-VN"),
          )}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={revCopy.kpi.aovCover}
          value={aovPerCover > 0 ? formatVND(aovPerCover) : "—"}
          hint={revCopy.kpi.aovCoverHint}
          delta={delta(aovPerCover, prevAovCover, "higher_better")}
        />
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

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div className="space-y-0.5">
            <CardTitle>{revCopy.heatmap.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {hourlyEnabled
                ? revCopy.heatmap.description
                : revCopy.heatmap.tooLargeRange}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 sm:pt-2">
          {hourlyEnabled && heatmapCells.length > 0 ? (
            <HeatmapGrid cells={heatmapCells} />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              {hourlyEnabled
                ? revCopy.heatmap.empty
                : revCopy.heatmap.tooLargeEmpty}
            </div>
          )}
        </CardContent>
      </Card>

      <SectionHeading
        title={revCopy.sections.tableTitle}
        description={revCopy.sections.tableDescription}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{revCopy.periodTable.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {params.branch == null
              ? revCopy.periodTable.descriptionAll
              : revCopy.periodTable.descriptionSingle}
          </p>
        </CardHeader>
        <CardContent scroll>
          {periodRows.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle className="text-sm font-semibold">
                  {revCopy.periodTable.empty}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{revCopy.periodTable.colPeriod}</TableHead>
                  <TableHead className="text-right">
                    {revCopy.periodTable.colOrders}
                  </TableHead>
                  <TableHead className="text-right">
                    {revCopy.periodTable.colCustomers}
                  </TableHead>
                  <TableHead className="text-right">
                    {revCopy.periodTable.colNetRevenue}
                  </TableHead>
                  <TableHead className="text-right">
                    {revCopy.periodTable.colCash}
                  </TableHead>
                  <TableHead className="text-right">VietQR</TableHead>
                  <TableHead className="text-right">MoMo</TableHead>
                  <TableHead className="text-right">
                    {revCopy.periodTable.colVat}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodRows.map((r) => {
                  const drillBranchId =
                    params.branch != null
                      ? params.branch
                      : r.branch_ids.length === 1
                        ? r.branch_ids[0]
                        : null;
                  const canDrill =
                    params.gran === "day" && drillBranchId != null;
                  return (
                    <TableRow key={r.period_start}>
                      <TableCell className="font-medium font-mono tabular-nums">
                        {canDrill ? (
                          <Link
                            href={`/finance/revenue/${r.period_start}?branch=${drillBranchId}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {r.period_label}
                          </Link>
                        ) : (
                          r.period_label
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {r.order_count.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {r.total_covers.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-medium">
                        {formatVND(netRevenuePreVatFor(r))}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatVND(r.cash_revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatVND(r.vietqr_revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatVND(r.momo_revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatVND(r.total_tax)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="font-medium">
                    {revCopy.periodTable.total}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-medium">
                    {(kpis?.order_count ?? 0).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-medium">
                    {(kpis?.total_covers ?? 0).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-bold">
                    {formatVND(netRevenuePreVat)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVND(kpis?.cash_revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVND(kpis?.vietqr_revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVND(kpis?.momo_revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVND(kpis?.total_tax ?? 0)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cashier table + Top items table */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{revCopy.cashierTable.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {cashierEnabled
                ? revCopy.cashierTable.description
                : revCopy.cashierTable.tooLargeRange}
            </p>
          </CardHeader>
          <CardContent scroll>
            {cashiers.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">
                    {cashierEnabled
                      ? revCopy.cashierTable.empty
                      : revCopy.cashierTable.tooLargeEmpty}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{revCopy.cashierTable.colCashier}</TableHead>
                    <TableHead className="text-right">
                      {revCopy.cashierTable.colOrders}
                    </TableHead>
                    <TableHead className="text-right">
                      {revCopy.cashierTable.colNetRevenue}
                    </TableHead>
                    <TableHead className="text-right">
                      {revCopy.cashierTable.colCash}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashiers.slice(0, 8).map((c) => (
                    <TableRow key={c.cashier_id ?? c.cashier_name}>
                      <TableCell className="font-medium">
                        {c.cashier_name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Number(c.order_count).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-medium">
                        {formatVND(Number(c.net_revenue))}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatVND(Number(c.cash_revenue))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{revCopy.topItems.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {revCopy.topItems.description}
            </p>
          </CardHeader>
          <CardContent scroll>
            {topItems.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">
                    {revCopy.topItems.empty}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{revCopy.topItems.colName}</TableHead>
                    <TableHead className="text-right">
                      {revCopy.topItems.colQty}
                    </TableHead>
                    <TableHead className="text-right">
                      {revCopy.topItems.colRevenue}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.slice(0, 8).map((item) => (
                    <TableRow key={`${item.branch_id}-${item.menu_item_id}`}>
                      <TableCell className="font-medium">
                        {item.item_name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Number(item.quantity_sold).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVND(item.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <SectionHeading
        title={revCopy.sections.controlTitle}
        description={revCopy.sections.controlDescription}
      />

      <WorkQueueStrip
        summary={
          dashboardSummary
            ? {
                ...dashboardSummary,
                invoice_attention_count: invoiceAttentionCount,
              }
            : null
        }
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{cashCopy.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{cashCopy.description}</p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {cashCopy.closedSessions}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {variance.session_count.toLocaleString("vi-VN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {cashCopy.netVariance}
            </p>
            <p
              className={
                tone === "good"
                  ? "text-lg font-semibold tabular-nums text-success"
                  : tone === "bad"
                    ? "text-lg font-semibold tabular-nums text-destructive"
                    : "text-lg font-semibold tabular-nums text-warning"
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
            <p className="text-lg font-semibold tabular-nums text-destructive">
              {formatVND(variance.short_total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {cashCopy.over(variance.over_count)}
            </p>
            <p className="text-lg font-semibold tabular-nums text-success">
              +{formatVND(variance.over_total)}
            </p>
          </div>
        </div>
        {variance.worst_cashiers.length > 0 ? (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {cashCopy.topVariance}
            </p>
            <ul className="space-y-1">
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
      </CardContent>
    </Card>
  );
}
