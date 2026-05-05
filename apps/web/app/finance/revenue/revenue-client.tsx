"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Badge } from "@comtammatu/ui/components/badge";
import { formatVND } from "@comtammatu/shared/format";
import { FORM_VI } from "@comtammatu/shared/messages";
import { refreshMaterializedViews } from "../actions";
import type { RevenueGranularity } from "../actions";
import type { FinanceLayoutMode } from "../page";
import { useFinanceRealtimeRefresh } from "../use-finance-realtime-refresh";
import { messages } from "@lib/messages";
import type {
  AccessibleBranch,
  CashVarianceSummary,
  ComparePeriod,
  KpiBundle,
  ReconcileSnippet,
  RollupRow,
} from "./page";

interface Props {
  branches: AccessibleBranch[];
  initialBranchId: number | null;
  initialRows: RollupRow[];
  initialKpis: KpiBundle | null;
  initialCompare: ComparePeriod | null;
  initialReconcile: ReconcileSnippet | null;
  initialCashVariance: CashVarianceSummary | null;
  initialStart: string;
  initialEnd: string;
  initialGranularity: RevenueGranularity;
  initialLayout: FinanceLayoutMode;
  initialError: string | null;
}

const revenueCopy = messages.finance.revenueReport;

const GRANULARITY_LABEL: Record<RevenueGranularity, string> = {
  day: revenueCopy.granularityLabel.day,
  week: revenueCopy.granularityLabel.week,
  month: revenueCopy.granularityLabel.month,
};

const PERIOD_HEADER_LABEL: Record<RevenueGranularity, string> = {
  day: revenueCopy.periodHeader.day,
  week: revenueCopy.periodHeader.week,
  month: revenueCopy.periodHeader.month,
};

const ALL_BRANCHES_VALUE = "all";

function formatPercent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatRefreshedAt(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const minutesAgo = Math.max(
    0,
    Math.floor((Date.now() - d.getTime()) / 60000),
  );
  return revenueCopy.refreshedAt(`${hh}:${mm}`, minutesAgo);
}

interface AggregatedRow {
  period_start: string;
  period_end: string;
  period_label: string;
  order_count: number;
  total_revenue: number;
  total_tax: number;
  cash_revenue: number;
  vietqr_revenue: number;
  momo_revenue: number;
  total_covers: number;
  branch_ids: number[];
}

// For "all branches" mode the RPC returns rows per (period × branch).
// Aggregate them per period for the time-series table; the per-branch
// breakdown is shown separately in BranchBreakdown.
function aggregateRowsByPeriod(rows: RollupRow[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const r of rows) {
    const key = `${r.period_start}|${r.period_end}`;
    const existing = map.get(key);
    if (existing) {
      existing.order_count += r.order_count;
      existing.total_revenue += r.total_revenue ?? 0;
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

export function RevenueClient({
  branches,
  initialBranchId,
  initialRows,
  initialKpis,
  initialCompare,
  initialReconcile,
  initialCashVariance,
  initialStart,
  initialEnd,
  initialGranularity,
  initialLayout,
  initialError,
}: Props) {
  const router = useRouter();
  const [granularity, setGranularity] =
    useState<RevenueGranularity>(initialGranularity);
  const [layout, setLayout] = useState<FinanceLayoutMode>(initialLayout);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [compareEnabled, setCompareEnabled] = useState<boolean>(
    Boolean(initialCompare),
  );
  const [isPending, startTransition] = useTransition();
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useFinanceRealtimeRefresh({ branchId });

  const branchLabel = useMemo(() => {
    if (branchId == null) return messages.finance.common.allBranches;
    return (
      branches.find((b) => b.id === branchId)?.name ??
      messages.finance.common.branchFallback(branchId)
    );
  }, [branchId, branches]);

  const aggregated = useMemo(
    () => aggregateRowsByPeriod(initialRows),
    [initialRows],
  );

  const branchTotals = useMemo(() => {
    if (branchId != null) return [];
    const map = new Map<
      number,
      { branchId: number; revenue: number; orders: number }
    >();
    for (const r of initialRows) {
      const existing = map.get(r.branch_id);
      const rev = r.total_revenue ?? 0;
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
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [initialRows, branchId]);

  function pushFilters(next: {
    granularity?: RevenueGranularity;
    start?: string;
    end?: string;
    branchId?: number | null;
    compare?: boolean;
    layout?: FinanceLayoutMode;
  }) {
    const params = new URLSearchParams();
    const g = next.granularity ?? granularity;
    const s = next.start ?? startDate;
    const e = next.end ?? endDate;
    const b = next.branchId === undefined ? branchId : next.branchId;
    const c = next.compare === undefined ? compareEnabled : next.compare;
    const l = next.layout ?? layout;
    params.set("granularity", g);
    params.set("start", s);
    params.set("end", e);
    params.set("branch", b == null ? ALL_BRANCHES_VALUE : String(b));
    params.set("layout", l);
    if (c) params.set("compare", "prev");
    startTransition(() => {
      router.replace(`/finance/revenue?${params.toString()}`);
      router.refresh();
    });
  }

  function handleToggleCompare() {
    const next = !compareEnabled;
    setCompareEnabled(next);
    pushFilters({ compare: next });
  }

  function handleLayoutChange(next: FinanceLayoutMode) {
    setLayout(next);
    pushFilters({ layout: next });
  }

  function handleGranularityChange(next: string) {
    const value = next as RevenueGranularity;
    // Auto-shift range để phù hợp granularity mới: day=30d, week=12w, month=12m.
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const d = new Date(today);
    if (value === "day") d.setDate(d.getDate() - 29);
    else if (value === "week") d.setDate(d.getDate() - 7 * 12);
    else d.setMonth(d.getMonth() - 12);
    const start = d.toISOString().slice(0, 10);
    setGranularity(value);
    setStartDate(start);
    setEndDate(end);
    pushFilters({ granularity: value, start, end });
  }

  function handleBranchChange(value: string) {
    const next = value === ALL_BRANCHES_VALUE ? null : Number(value);
    setBranchId(next);
    pushFilters({ branchId: next });
  }

  function handleApplyDateRange() {
    pushFilters({});
  }

  async function handleRefresh() {
    setRefreshError(null);
    startTransition(async () => {
      const res = await refreshMaterializedViews();
      if (!res.success) {
        setRefreshError(res.error ?? "Không thể làm mới dữ liệu.");
        return;
      }
      router.refresh();
    });
  }

  function handleExportCsv() {
    // CSV xuất từ aggregated rows (period-level đã gộp branch). Format
    // VN-friendly: dấu chấm làm thousand separator, không format số kiểu
    // Excel làm mất leading zero. UTF-8 BOM giúp Excel mở đúng dấu.
    const sep = ";"; // semicolon — Excel VN locale parse số có dấu phẩy
    const header = [
      "Kỳ",
      "Số đơn",
      "Lượt khách",
      "Doanh thu",
      "Tiền mặt",
      "VietQR",
      "MoMo",
      "VAT",
    ];
    const escape = (s: string) =>
      s.includes(sep) || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    const lines: string[] = [header.map(escape).join(sep)];
    for (const r of aggregated) {
      lines.push(
        [
          r.period_label,
          String(r.order_count),
          String(r.total_covers),
          String(Math.round(r.total_revenue)),
          String(Math.round(r.cash_revenue)),
          String(Math.round(r.vietqr_revenue)),
          String(Math.round(r.momo_revenue)),
          String(Math.round(r.total_tax)),
        ]
          .map(escape)
          .join(sep),
      );
    }
    if (kpis) {
      lines.push(
        [
          "Tổng",
          String(kpis.order_count),
          String(kpis.total_covers),
          String(Math.round(kpis.net_revenue)),
          String(Math.round(kpis.cash_revenue)),
          String(Math.round(kpis.vietqr_revenue)),
          String(Math.round(kpis.momo_revenue)),
          String(Math.round(kpis.total_tax)),
        ]
          .map(escape)
          .join(sep),
      );
    }
    const csv = "﻿" + lines.join("\n"); // BOM
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const branchSlug = branchId == null ? "all" : `cn-${branchId}`;
    const filename = `doanh-thu-${branchSlug}-${startDate}_${endDate}.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const kpis = initialKpis;
  const prev = initialCompare?.kpis ?? null;
  const grossRevenue = kpis ? kpis.subtotal_revenue + kpis.discount_amount : 0;
  const aov =
    kpis && kpis.total_covers > 0
      ? Math.round(kpis.net_revenue / kpis.total_covers)
      : 0;
  const prevAov =
    prev && prev.total_covers > 0
      ? Math.round(prev.net_revenue / prev.total_covers)
      : 0;
  const voidedPct =
    kpis && kpis.net_revenue > 0
      ? (kpis.voided_amount / (kpis.net_revenue + kpis.voided_amount)) * 100
      : 0;
  const prevVoidedPct =
    prev && prev.net_revenue > 0
      ? (prev.voided_amount / (prev.net_revenue + prev.voided_amount)) * 100
      : 0;
  const discountPct =
    kpis && grossRevenue > 0 ? (kpis.discount_amount / grossRevenue) * 100 : 0;
  const prevGrossRevenue = prev
    ? prev.subtotal_revenue + prev.discount_amount
    : 0;
  const prevDiscountPct =
    prev && prevGrossRevenue > 0
      ? (prev.discount_amount / prevGrossRevenue) * 100
      : 0;

  const channelTotal =
    (kpis?.cash_revenue ?? 0) +
    (kpis?.vietqr_revenue ?? 0) +
    (kpis?.momo_revenue ?? 0);
  const channelOther = (kpis?.net_revenue ?? 0) - channelTotal;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">{revenueCopy.badge}</Badge>
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {revenueCopy.title(GRANULARITY_LABEL[granularity], branchLabel)}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {revenueCopy.description}
              </p>
              {kpis ? (
                <p className="text-xs text-muted-foreground">
                  {formatRefreshedAt(kpis.refreshed_at)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LayoutPicker value={layout} onChange={handleLayoutChange} />
              <Button
                variant={compareEnabled ? "default" : "outline"}
                size="sm"
                onClick={handleToggleCompare}
                disabled={isPending}
              >
                {compareEnabled
                  ? revenueCopy.compareOn
                  : revenueCopy.compareOff}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={aggregated.length === 0}
              >
                {revenueCopy.exportCsv}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isPending}
              >
                {isPending ? messages.finance.common.loading : revenueCopy.refreshData}
              </Button>
            </div>
          </div>
          {refreshError ? (
            <p className="mt-3 text-sm text-destructive">{refreshError}</p>
          ) : null}
          {initialError ? (
            <p className="mt-3 text-sm text-destructive">{initialError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="grid gap-1.5">
            <Label className="text-xs">{revenueCopy.branch}</Label>
            <Select
              value={branchId == null ? ALL_BRANCHES_VALUE : String(branchId)}
              onValueChange={handleBranchChange}
            >
              <SelectTrigger>
                <SelectValue placeholder={revenueCopy.branchPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANCHES_VALUE}>
                  {revenueCopy.allBranchesCount(branches.length)}
                </SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{revenueCopy.granularity}</Label>
            <Tabs value={granularity} onValueChange={handleGranularityChange}>
              <TabsList className="w-full">
                <TabsTrigger value="day" className="flex-1">
                  {revenueCopy.day}
                </TabsTrigger>
                <TabsTrigger value="week" className="flex-1">
                  {revenueCopy.week}
                </TabsTrigger>
                <TabsTrigger value="month" className="flex-1">
                  {revenueCopy.month}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{FORM_VI.fromDate}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{FORM_VI.toDate}</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Button
                size="sm"
                onClick={handleApplyDateRange}
                disabled={isPending}
              >
                {revenueCopy.apply}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={revenueCopy.totalCollected}
          value={formatVND(kpis?.net_revenue ?? 0)}
          hint={kpis ? revenueCopy.beforeVat(formatVND(kpis.subtotal_revenue)) : "—"}
          tone="primary"
          delta={
            initialCompare
              ? buildDelta(
                  kpis?.net_revenue ?? 0,
                  prev?.net_revenue ?? 0,
                  "currency",
                )
              : null
          }
        />
        <KpiCard
          label={revenueCopy.orderCount}
          value={(kpis?.order_count ?? 0).toLocaleString("vi-VN")}
          hint={revenueCopy.customerVisits(
            (kpis?.total_covers ?? 0).toLocaleString("vi-VN"),
          )}
          delta={
            initialCompare
              ? buildDelta(
                  kpis?.order_count ?? 0,
                  prev?.order_count ?? 0,
                  "count",
                )
              : null
          }
        />
        <KpiCard
          label={revenueCopy.averagePerGuest}
          value={aov > 0 ? formatVND(aov) : "—"}
          hint={revenueCopy.revenuePerGuest}
          delta={initialCompare ? buildDelta(aov, prevAov, "currency") : null}
        />
        <KpiCard
          label={revenueCopy.voidRate}
          value={`${voidedPct.toFixed(1)}%`}
          hint={
            kpis
              ? revenueCopy.voidHint(
                  formatVND(kpis.voided_amount),
                  kpis.voided_count,
                )
              : "—"
          }
          tone={voidedPct > 2 ? "warning" : undefined}
          delta={
            initialCompare
              ? buildDelta(voidedPct, prevVoidedPct, "percent_lower_better")
              : null
          }
        />
        <KpiCard
          label={revenueCopy.discountRate}
          value={`${discountPct.toFixed(1)}%`}
          hint={kpis ? formatVND(kpis.discount_amount) : "—"}
          delta={
            initialCompare
              ? buildDelta(discountPct, prevDiscountPct, "percent_lower_better")
              : null
          }
        />
      </div>

      {initialCompare ? (
        <p className="text-xs text-muted-foreground">
          {revenueCopy.comparePeriod(initialCompare.start, initialCompare.end)}
          {prev ? null : revenueCopy.noPreviousDataSuffix}
        </p>
      ) : null}

      {layout === "simple" ? (
        <SimpleRevenueSummary
          aggregated={aggregated}
          branchTotals={branchTotals}
          branches={branches}
          branchId={branchId}
          granularity={granularity}
          startDate={startDate}
          endDate={endDate}
          kpis={kpis}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {initialReconcile ? (
              <ReconcileCard reconcile={initialReconcile} />
            ) : null}
            {initialCashVariance ? (
              <CashVarianceCard variance={initialCashVariance} />
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownCard
              title={revenueCopy.paymentBreakdown}
              rows={[
                {
                  label: revenueCopy.cash,
                  value: kpis?.cash_revenue ?? 0,
                  total: kpis?.net_revenue ?? 0,
                },
                {
                  label: "VietQR",
                  value: kpis?.vietqr_revenue ?? 0,
                  total: kpis?.net_revenue ?? 0,
                },
                {
                  label: "MoMo",
                  value: kpis?.momo_revenue ?? 0,
                  total: kpis?.net_revenue ?? 0,
                },
                ...(channelOther > 1
                  ? [
                      {
                        label: revenueCopy.other,
                        value: channelOther,
                        total: kpis?.net_revenue ?? 0,
                      },
                    ]
                  : []),
              ]}
            />
            <BreakdownCard
              title={revenueCopy.dineTakeaway}
              rows={[
                {
                  label: revenueCopy.dineIn,
                  value: kpis?.dine_in_revenue ?? 0,
                  total: kpis?.net_revenue ?? 0,
                },
                {
                  label: revenueCopy.takeaway,
                  value: kpis?.takeaway_revenue ?? 0,
                  total: kpis?.net_revenue ?? 0,
                },
              ]}
            />
            <BreakdownCard
              title={revenueCopy.outputVat}
              rows={[
                {
                  label: "VAT 8%",
                  value: kpis?.vat_8_amount ?? 0,
                  total: kpis?.total_tax ?? 0,
                },
                {
                  label: "VAT 10%",
                  value: kpis?.vat_10_amount ?? 0,
                  total: kpis?.total_tax ?? 0,
                },
              ]}
              footer={
                kpis ? revenueCopy.totalTax(formatVND(kpis.total_tax)) : undefined
              }
            />
          </div>

          {branchId == null && branchTotals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {revenueCopy.branchRevenueTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{revenueCopy.branch}</TableHead>
                      <TableHead className="text-right">
                        {revenueCopy.orders}
                      </TableHead>
                      <TableHead className="text-right">
                        {revenueCopy.revenue}
                      </TableHead>
                      <TableHead className="w-32 text-right">
                        {revenueCopy.action}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchTotals.map((bt) => {
                      const name =
                        branches.find((b) => b.id === bt.branchId)?.name ??
                        messages.finance.common.branchFallback(bt.branchId);
                      const params = new URLSearchParams({
                        granularity,
                        start: startDate,
                        end: endDate,
                        branch: String(bt.branchId),
                        layout: "advanced",
                      });
                      return (
                        <TableRow key={bt.branchId}>
                          <TableCell className="font-medium">{name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {bt.orders.toLocaleString("vi-VN")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatVND(bt.revenue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/finance/revenue?${params.toString()}`}
                              >
                                {revenueCopy.viewBranch}
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {revenueCopy.periodRevenueTable}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {branchId == null
                  ? revenueCopy.periodTableDescriptionAll
                  : revenueCopy.periodTableDescriptionSingle}
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {aggregated.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      {revenueCopy.emptyRange}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{PERIOD_HEADER_LABEL[granularity]}</TableHead>
                      <TableHead className="text-right">
                        {revenueCopy.orders}
                      </TableHead>
                      <TableHead className="text-right">
                        {revenueCopy.customers}
                      </TableHead>
                      <TableHead className="text-right">
                        {revenueCopy.revenue}
                      </TableHead>
                      <TableHead className="text-right">
                        {revenueCopy.cash}
                      </TableHead>
                      <TableHead className="text-right">VietQR</TableHead>
                      <TableHead className="text-right">MoMo</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregated.map((r) => {
                      const drillBranchId =
                        branchId != null
                          ? branchId
                          : r.branch_ids.length === 1
                            ? r.branch_ids[0]
                            : null;
                      const canDrill =
                        granularity === "day" && drillBranchId != null;
                      return (
                        <TableRow
                          key={r.period_start}
                          className={canDrill ? "cursor-pointer" : undefined}
                        >
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
                            {formatVND(r.total_revenue)}
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
                      <TableCell className="font-medium">
                        {revenueCopy.total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {(kpis?.order_count ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {(kpis?.total_covers ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatVND(kpis?.net_revenue ?? 0)}
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
        </>
      )}
    </div>
  );
}

interface DeltaInfo {
  display: string; // human label e.g. "+12% vs trước"
  // sign tells the renderer which semantic color to apply.
  // "good" = improvement (revenue up, voided down). "bad" = regression.
  // "neutral" = no prev data or zero base.
  sign: "good" | "bad" | "neutral";
}

type DeltaKind = "currency" | "count" | "percent_lower_better";

function buildDelta(
  current: number,
  previous: number,
  kind: DeltaKind,
): DeltaInfo {
  if (previous === 0 && current === 0) {
    return { display: "= 0", sign: "neutral" };
  }
  if (previous === 0) {
    return { display: "Mới", sign: "neutral" };
  }
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";
  const display = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
  // Lower-better metrics flip the goodness mapping.
  const isImprovement = kind === "percent_lower_better" ? diff < 0 : diff > 0;
  const isRegression = kind === "percent_lower_better" ? diff > 0 : diff < 0;
  const sign: DeltaInfo["sign"] = isImprovement
    ? "good"
    : isRegression
      ? "bad"
      : "neutral";
  return { display, sign };
}

function LayoutPicker({
  value,
  onChange,
}: {
  value: FinanceLayoutMode;
  onChange: (value: FinanceLayoutMode) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as FinanceLayoutMode)}
    >
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="simple" className="flex-1 sm:flex-none">
          {revenueCopy.layoutSimple}
        </TabsTrigger>
        <TabsTrigger value="advanced" className="flex-1 sm:flex-none">
          {revenueCopy.layoutAdvanced}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function SimpleRevenueSummary({
  aggregated,
  branchTotals,
  branches,
  branchId,
  granularity,
  startDate,
  endDate,
  kpis,
}: {
  aggregated: AggregatedRow[];
  branchTotals: Array<{ branchId: number; revenue: number; orders: number }>;
  branches: AccessibleBranch[];
  branchId: number | null;
  granularity: RevenueGranularity;
  startDate: string;
  endDate: string;
  kpis: KpiBundle | null;
}) {
  const rows = [...aggregated].reverse().slice(0, 10);
  const paymentTotal =
    (kpis?.cash_revenue ?? 0) +
    (kpis?.vietqr_revenue ?? 0) +
    (kpis?.momo_revenue ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {revenueCopy.revenueByPeriod}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {startDate} → {endDate}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 ? (
              <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                    {revenueCopy.emptyRange}
                    </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              rows.map((row) => {
                const drillBranchId =
                  branchId != null
                    ? branchId
                    : row.branch_ids.length === 1
                      ? row.branch_ids[0]
                      : null;
                const canDrill = granularity === "day" && drillBranchId != null;
                return (
                  <div
                    key={row.period_start}
                    className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                  >
                    <div>
                      {canDrill ? (
                        <Link
                          href={`/finance/revenue/${row.period_start}?branch=${drillBranchId}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {row.period_label}
                        </Link>
                      ) : (
                        <p className="font-medium">{row.period_label}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {revenueCopy.orderCustomerLine(
                          row.order_count.toLocaleString("vi-VN"),
                          row.total_covers.toLocaleString("vi-VN"),
                        )}
                      </p>
                    </div>
                    <p className="text-right font-semibold tabular-nums">
                      {formatVND(row.total_revenue)}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {revenueCopy.quickStructure}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CompactBreakdown
              label={revenueCopy.cash}
              value={kpis?.cash_revenue ?? 0}
              total={paymentTotal}
            />
            <CompactBreakdown
              label="VietQR"
              value={kpis?.vietqr_revenue ?? 0}
              total={paymentTotal}
            />
            <CompactBreakdown
              label="MoMo"
              value={kpis?.momo_revenue ?? 0}
              total={paymentTotal}
            />
            <div className="border-t pt-3">
              <CompactBreakdown
                label={revenueCopy.dineIn}
                value={kpis?.dine_in_revenue ?? 0}
                total={kpis?.net_revenue ?? 0}
              />
              <CompactBreakdown
                label={revenueCopy.takeaway}
                value={kpis?.takeaway_revenue ?? 0}
                total={kpis?.net_revenue ?? 0}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {branchId == null && branchTotals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {revenueCopy.highlightedBranches}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {branchTotals.slice(0, 6).map((branch) => {
              const name =
                branches.find((b) => b.id === branch.branchId)?.name ??
                messages.finance.common.branchFallback(branch.branchId);
              const params = new URLSearchParams({
                granularity,
                start: startDate,
                end: endDate,
                branch: String(branch.branchId),
                layout: "simple",
              });
              return (
                <div
                  key={branch.branchId}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div>
                    <Link
                      href={`/finance/revenue?${params.toString()}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {revenueCopy.ordersLine(
                        branch.orders.toLocaleString("vi-VN"),
                      )}
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {formatVND(branch.revenue)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CompactBreakdown({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">
        {formatVND(value)}
        <span className="ml-2 text-xs text-muted-foreground">
          {formatPercent(value, total)}
        </span>
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "warning";
  delta?: DeltaInfo | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={
            tone === "primary"
              ? "text-2xl font-bold tabular-nums text-primary"
              : tone === "warning"
                ? "text-2xl font-bold tabular-nums text-warning"
                : "text-2xl font-bold tabular-nums text-foreground"
          }
        >
          {value}
        </p>
        {delta ? (
          <p
            className={
              delta.sign === "good"
                ? "text-xs font-medium text-success"
                : delta.sign === "bad"
                  ? "text-xs font-medium text-destructive"
                  : "text-xs font-medium text-muted-foreground"
            }
          >
            {delta.display}
          </p>
        ) : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CashVarianceCard({ variance }: { variance: CashVarianceSummary }) {
  // Tone: signed total_variance đo "ròng" (thừa - thiếu). Owner thường
  // care về abs_variance_total + cờ "có lệch âm tập trung 1 cashier?"
  // (BA #9). > 0.5% revenue threshold thường dùng — ở đây không có
  // mẫu số revenue trong card này, nên dùng abs_variance_total trực
  // tiếp + đếm short_count để gắn cờ.
  const hasShortPattern = variance.short_count >= 3;
  const tone =
    variance.abs_variance_total === 0
      ? "good"
      : hasShortPattern
        ? "bad"
        : "warn";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{revenueCopy.cashVarianceTitle}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {revenueCopy.cashVarianceDescription}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {revenueCopy.closedSessions}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {variance.session_count.toLocaleString("vi-VN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {revenueCopy.netVariance}
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
              {revenueCopy.shortVariance(variance.short_count)}
            </p>
            <p className="text-lg font-semibold tabular-nums text-destructive">
              {formatVND(variance.short_total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {revenueCopy.overVariance(variance.over_count)}
            </p>
            <p className="text-lg font-semibold tabular-nums text-success">
              +{formatVND(variance.over_total)}
            </p>
          </div>
        </div>
        {variance.worst_cashiers.length > 0 ? (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {revenueCopy.topVarianceCashiers}
            </p>
            <ul className="space-y-1">
              {variance.worst_cashiers.map((c) => (
                <li
                  key={c.cashier_id ?? c.cashier_name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">
                    {c.cashier_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {revenueCopy.sessionCount(c.session_count)}
                    </span>
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
            {revenueCopy.noVariance}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReconcileCard({ reconcile }: { reconcile: ReconcileSnippet }) {
  const TOLERANCE = 1;
  const diff = reconcile.difference;
  const matched = Math.abs(diff) <= TOLERANCE;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {revenueCopy.reconciliationTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {revenueCopy.reconciliationDescription}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {revenueCopy.posSubledger}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatVND(reconcile.subledger_total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {revenueCopy.generalLedger}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatVND(reconcile.gl_total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {revenueCopy.difference}
          </p>
          <p
            className={
              matched
                ? "text-lg font-semibold tabular-nums text-success"
                : "text-lg font-semibold tabular-nums text-destructive"
            }
          >
            {matched ? revenueCopy.matched : formatVND(diff)}
          </p>
        </div>
        <div className="sm:col-span-3">
          <Button asChild size="sm" variant="outline">
            <Link href={`/finance/reconciliation?since=${reconcile.start}`}>
              {revenueCopy.openReconciliation}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: { label: string; value: number; total: number }[];
  footer?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground">{r.label}</span>
            <span className="tabular-nums font-medium">
              {formatVND(r.value)}
              <span className="ml-2 text-xs text-muted-foreground">
                {formatPercent(r.value, r.total)}
              </span>
            </span>
          </div>
        ))}
        {footer ? (
          <p className="border-t pt-2 text-xs text-muted-foreground">
            {footer}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
