"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
  type ChartConfig,
} from "@comtammatu/ui/components/chart";
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
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { formatVND } from "@comtammatu/shared/format";
import type { FinanceDashboardSummary } from "../actions";
import type {
  FinanceDashboardHealth,
  TopItemRow,
} from "../_lib/finance-types";
import type { FinanceParams } from "../_lib/finance-params";
import { ChartCard } from "../components/chart-card";
import {
  buildCompareDelta,
  type CompareDelta,
} from "../components/compare-chip";
import {
  ExportToolbar,
  type CsvSection,
} from "../components/export-toolbar";
import { FilterBar } from "../components/filter-bar";
import { HeatmapGrid, type HeatmapCell } from "../components/heatmap-grid";
import { KpiCard } from "../components/kpi-card";
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
  ReconcileSnippet,
  RollupRow,
} from "./page";

const filterCopy = messages.finance.filterBar;
const revCopy = messages.finance.revenue;
const reconCopy = messages.finance.reconcileCard;
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
  cashiers: CashierRow[];
  reconcile: ReconcileSnippet | null;
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
    const rev =
      (r.subtotal_revenue ?? 0) - (r.discount_amount ?? 0);
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
  cashiers,
  reconcile,
  cashVariance,
  dashboardSummary,
  dashboardHealth,
  invoiceAttentionCount,
  resolvedStart,
  resolvedEnd,
}: Props) {
  const periodRows = useMemo(
    () => aggregateByPeriod(rollupRows),
    [rollupRows],
  );
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
    <div className="space-y-5">
      {/* Status bar — staleness + export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MvStalenessBanner
          lastRefreshAt={kpis?.refreshed_at ?? null}
          className="flex-1"
        />
        <ExportToolbar
          filename={csvFilename}
          signature={{
            branchLabel,
            rangeLabel: `${resolvedStart} → ${resolvedEnd}`,
            granularityLabel,
            extra:
              params.payment === "all"
                ? undefined
                : [
                    params.payment === "cash"
                      ? filterCopy.paymentCash
                      : params.payment === "vietqr"
                        ? filterCopy.paymentVietqr
                        : filterCopy.paymentMomo,
                  ],
          }}
          sections={csvSections}
        />
      </div>

      {/* Work queue strip — operational alerts visible on every Finance route */}
      <WorkQueueStrip
        summary={
          dashboardSummary
            ? { ...dashboardSummary, invoice_attention_count: invoiceAttentionCount }
            : null
        }
        health={dashboardHealth}
      />

      {/* Filter bar — single source of truth for URL state */}
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/revenue"
      />

      {/* KPI grid — 8 cards per BA §2 contract */}
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
        <KpiCard
          label={revCopy.kpi.totalCollected}
          value={formatVND(kpis?.net_revenue ?? 0)}
          hint={revCopy.kpi.totalCollectedHint(
            formatVND(kpis?.total_tax ?? 0),
          )}
          href={`/finance/reconciliation?since=${resolvedStart}`}
          delta={delta(
            kpis?.net_revenue ?? 0,
            prev?.net_revenue ?? 0,
            "higher_better",
          )}
        />
        <KpiCard
          label={revCopy.kpi.invoices}
          value={(invoiceAttentionCount + (dashboardSummary?.invoice_issued_count ?? 0)).toLocaleString("vi-VN")}
          hint={
            invoiceAttentionCount > 0
              ? revCopy.kpi.invoicesAttention(invoiceAttentionCount)
              : revCopy.kpi.invoicesClear
          }
          tone={invoiceAttentionCount > 0 ? "warning" : "neutral"}
          href="/finance/invoices"
        />
      </div>

      {/* Compare period footnote */}
      {compare ? (
        <p className="text-xs text-muted-foreground">
          {revCopy.compare.periodLabel} {compare.start} → {compare.end}
          {prev ? null : revCopy.compare.noPrevData}
        </p>
      ) : null}

      {/* Big chart row — net revenue trend */}
      <ChartCard
        title={revCopy.trendChart.title}
        description={revCopy.trendChart.description(
          resolvedStart,
          resolvedEnd,
          granularityLabel,
        )}
        config={
          {
            revenue: {
              label: revCopy.trendChart.tooltipLabel,
              theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
            },
          } satisfies ChartConfig
        }
        chartClassName="aspect-[3/1]"
        empty={trendData.length === 0}
      >
        <LineChart data={trendData} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(v)
            }
          />
          <Tooltip
            formatter={(value) => [
              formatVND(Number(value ?? 0)),
              revCopy.trendChart.tooltipLabel,
            ]}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ChartCard>

      {/* Mid row — payment donut + branch bar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={revCopy.paymentChart.title}
          description={
            paymentTotal > 0
              ? revCopy.paymentChart.total(formatVND(paymentTotal))
              : revCopy.paymentChart.empty
          }
          config={
            {
              cash: { label: revCopy.paymentChart.cash, theme: { light: "var(--chart-1)", dark: "var(--chart-1)" } },
              vietqr: { label: "VietQR", theme: { light: "var(--chart-2)", dark: "var(--chart-2)" } },
              momo: { label: "MoMo", theme: { light: "var(--chart-3)", dark: "var(--chart-3)" } },
            } satisfies ChartConfig
          }
          chartClassName="aspect-square max-h-72"
          empty={paymentTotal === 0}
        >
          <PieChart>
            <Pie
              data={paymentData}
              dataKey="value"
              nameKey="key"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {paymentData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={`var(--color-${entry.key})`}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => [
                formatVND(Number(value ?? 0)),
                item && typeof item.payload === "object" && item.payload != null
                  ? (item.payload as { label: string }).label
                  : "",
              ]}
            />
            <Legend
              formatter={(_value, entry) => {
                const key = entry.dataKey as string;
                const row = paymentData.find((d) => d.key === key);
                return row?.label ?? key;
              }}
            />
          </PieChart>
        </ChartCard>

        <ChartCard
          title={revCopy.branchChart.title}
          description={
            params.branch == null
              ? revCopy.branchChart.descriptionAll
              : revCopy.branchChart.descriptionSingle
          }
          config={
            {
              revenue: {
                label: revCopy.trendChart.tooltipLabel,
                theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
              },
            } satisfies ChartConfig
          }
          chartClassName="aspect-square max-h-72"
          empty={branchRows.length === 0 || params.branch != null}
          emptyLabel={
            params.branch != null
              ? revCopy.branchChart.emptySingle
              : revCopy.branchChart.emptyData
          }
        >
          <BarChart data={branchRows.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(v)
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              formatter={(value) => [
                formatVND(Number(value ?? 0)),
                revCopy.trendChart.tooltipLabel,
              ]}
            />
            <Bar
              dataKey="revenue"
              fill="var(--color-revenue)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartCard>
      </div>

      {/* Heatmap — full width */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div className="space-y-0.5">
            <CardTitle className="text-base">
              {revCopy.heatmap.title}
            </CardTitle>
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

      {/* Period table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{revCopy.periodTable.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {params.branch == null
              ? revCopy.periodTable.descriptionAll
              : revCopy.periodTable.descriptionSingle}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
                  <TableHead className="text-right">{revCopy.periodTable.colOrders}</TableHead>
                  <TableHead className="text-right">{revCopy.periodTable.colCustomers}</TableHead>
                  <TableHead className="text-right">{revCopy.periodTable.colNetRevenue}</TableHead>
                  <TableHead className="text-right">{revCopy.periodTable.colCash}</TableHead>
                  <TableHead className="text-right">VietQR</TableHead>
                  <TableHead className="text-right">MoMo</TableHead>
                  <TableHead className="text-right">{revCopy.periodTable.colVat}</TableHead>
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
                      <TableCell className="font-medium tabular-nums">
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
                      <TableCell className="text-right tabular-nums">
                        {r.order_count.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.total_covers.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatVND(netRevenuePreVatFor(r))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(r.cash_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(r.vietqr_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(r.momo_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(r.total_tax)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="font-medium">{revCopy.periodTable.total}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {(kpis?.order_count ?? 0).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {(kpis?.total_covers ?? 0).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {formatVND(netRevenuePreVat)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(kpis?.cash_revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(kpis?.vietqr_revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(kpis?.momo_revenue ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
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
            <CardTitle className="text-base">{revCopy.cashierTable.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {revCopy.cashierTable.description}
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {cashiers.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">
                    {revCopy.cashierTable.empty}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{revCopy.cashierTable.colCashier}</TableHead>
                    <TableHead className="text-right">{revCopy.cashierTable.colOrders}</TableHead>
                    <TableHead className="text-right">{revCopy.cashierTable.colNetRevenue}</TableHead>
                    <TableHead className="text-right">{revCopy.cashierTable.colCash}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashiers.slice(0, 8).map((c) => (
                    <TableRow key={c.cashier_id ?? c.cashier_name}>
                      <TableCell className="font-medium">
                        {c.cashier_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(c.order_count).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatVND(Number(c.net_revenue))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
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
            <CardTitle className="text-base">{revCopy.topItems.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {revCopy.topItems.description}
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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
                    <TableHead className="text-right">{revCopy.topItems.colQty}</TableHead>
                    <TableHead className="text-right">{revCopy.topItems.colRevenue}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.slice(0, 8).map((item) => (
                    <TableRow key={`${item.branch_id}-${item.menu_item_id}`}>
                      <TableCell className="font-medium">
                        {item.item_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(item.quantity_sold).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
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

      {/* Reconcile + Cash variance — surfaces only when data exists */}
      {(reconcile || cashVariance) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {reconcile ? <ReconcileCard reconcile={reconcile} /> : null}
          {cashVariance ? <CashVarianceCard variance={cashVariance} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-components (preserved from previous client) ────────────

function ReconcileCard({ reconcile }: { reconcile: ReconcileSnippet }) {
  const TOLERANCE = 1;
  const diff = reconcile.difference;
  const matched = Math.abs(diff) <= TOLERANCE;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{reconCopy.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {reconCopy.description}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">{reconCopy.posSubledger}</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatVND(reconcile.subledger_total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{reconCopy.generalLedger}</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatVND(reconcile.gl_total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{reconCopy.difference}</p>
          <p
            className={
              matched
                ? "text-lg font-semibold tabular-nums text-success"
                : "text-lg font-semibold tabular-nums text-destructive"
            }
          >
            {matched ? reconCopy.matched : formatVND(diff)}
          </p>
        </div>
        <div className="sm:col-span-3">
          <Button asChild size="sm" variant="outline">
            <Link href={`/finance/reconciliation?since=${reconcile.start}`}>
              {reconCopy.openDetail}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
        <CardTitle className="text-base">{cashCopy.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{cashCopy.description}</p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{cashCopy.closedSessions}</p>
            <p className="text-lg font-semibold tabular-nums">
              {variance.session_count.toLocaleString("vi-VN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{cashCopy.netVariance}</p>
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
