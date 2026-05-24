import {
  fetchAccessibleBranches,
  fetchCashVarianceSummary,
  fetchFinanceDashboardSummary,
  fetchRevenueByCashier,
  fetchRevenueByHour,
  fetchRevenueKpis,
  fetchRevenueRollup,
  fetchTaxInvoices,
  fetchTopItems,
  type FinanceDashboardSummary,
} from "../actions";
import { fetchFoodCost } from "../accounting-actions";
import { fetchFiscalPeriods } from "../period-actions";
import {
  fetchReconciliation,
  type ReconciliationReport,
} from "../reconciliation-actions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { diffVNDateDays } from "@comtammatu/shared/time";
import type {
  FinanceDashboardHealth,
  FiscalPeriodRow,
  TopItemRow,
} from "../_lib/finance-types";
import { RevenueClient } from "./revenue-client";

// ─── Server Component types ─────────────────────────────────────

export interface AccessibleBranch {
  id: number;
  name: string;
}

export interface RollupRow {
  period_start: string;
  period_end: string;
  period_label: string;
  branch_id: number;
  order_count: number;
  total_revenue: number | null;
  total_tax: number | null;
  subtotal_revenue: number | null;
  discount_amount: number | null;
  cash_revenue: number | null;
  vietqr_revenue: number | null;
  momo_revenue: number | null;
  dine_in_revenue: number | null;
  takeaway_revenue: number | null;
  total_covers: number;
}

export interface KpiBundle {
  net_revenue: number;
  subtotal_revenue: number;
  discount_amount: number;
  total_tax: number;
  vat_8_amount: number;
  vat_10_amount: number;
  order_count: number;
  total_covers: number;
  cash_revenue: number;
  vietqr_revenue: number;
  momo_revenue: number;
  dine_in_revenue: number;
  takeaway_revenue: number;
  voided_amount: number;
  voided_count: number;
  refreshed_at: string;
}

export interface ReconcileSnippet {
  subledger_total: number;
  gl_total: number;
  difference: number;
  start: string;
  end: string;
}

export interface ComparePeriod {
  start: string;
  end: string;
  kpis: KpiBundle | null;
}

export interface WorstCashier {
  cashier_id: string | null;
  cashier_name: string;
  session_count: number;
  net_variance: number;
  abs_variance: number;
}

export interface CashVarianceSummary {
  session_count: number;
  total_variance: number;
  abs_variance_total: number;
  short_count: number;
  short_total: number;
  over_count: number;
  over_total: number;
  worst_cashiers: WorstCashier[];
}

export interface HourBucket {
  dow: number;
  hour: number;
  order_count: number;
  net_revenue: number;
}

export interface CashierRow {
  cashier_id: string | null;
  cashier_name: string;
  order_count: number;
  net_revenue: number;
  cash_revenue: number;
  qr_revenue: number;
}

interface FinanceFoodCostRow {
  item_name: string | null;
  food_cost_pct: number | null;
}

const RECONCILIATION_TOLERANCE = 1;
const FOOD_COST_EXCEPTION_THRESHOLD = 60;
// Hour-of-day RPC caps at 90d. The contract gives owners up to YTD on
// the same surface, so when the resolved range exceeds 90d we skip
// fetching the heatmap and show an inline "range too large" hint.
const HOURLY_MAX_DAYS = 90;

function diffDays(start: string, end: string): number {
  return Math.max(0, diffVNDateDays(start, end) + 1);
}

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const resolved = resolveFinanceRange(params);

  const hourlyEnabled =
    diffDays(resolved.start, resolved.end) <= HOURLY_MAX_DAYS;
  const cashierEnabled = hourlyEnabled;

  // Single Promise.all — branches + 12 data RPCs run concurrently. Previous
  // code awaited branches first then started the data fetch, paying one
  // unnecessary RTT per page load.
  const [
    branchesRes,
    rollupRes,
    kpisRes,
    prevKpisRes,
    reconcileRes,
    cashVarianceRes,
    topItemsRes,
    hourRes,
    cashierRes,
    dashboardSummaryRes,
    fiscalPeriodsRes,
    foodCostRes,
    invoicesRes,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchRevenueRollup(
      params.branch,
      resolved.start,
      resolved.end,
      params.gran,
    ),
    fetchRevenueKpis(params.branch, resolved.start, resolved.end),
    resolved.compare
      ? fetchRevenueKpis(
          params.branch,
          resolved.compare.start,
          resolved.compare.end,
        )
      : Promise.resolve({ success: true as const, data: null }),
    fetchReconciliation({
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    fetchCashVarianceSummary(params.branch, resolved.start, resolved.end),
    fetchTopItems(params.branch, resolved.start.slice(0, 7) + "-01"),
    hourlyEnabled
      ? fetchRevenueByHour(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: [] }),
    cashierEnabled
      ? fetchRevenueByCashier(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: [] }),
    fetchFinanceDashboardSummary(params.branch, resolved.start, resolved.end),
    fetchFiscalPeriods(),
    fetchFoodCost({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    fetchTaxInvoices(params.branch ?? undefined),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];

  const rows = (rollupRes.success ? (rollupRes.data ?? []) : []) as RollupRow[];
  const kpis = (kpisRes.success ? kpisRes.data : null) as KpiBundle | null;
  const prevKpis = (
    prevKpisRes.success ? prevKpisRes.data : null
  ) as KpiBundle | null;
  const topItems = topItemsRes.success
    ? ((topItemsRes.data ?? []) as TopItemRow[])
    : [];
  const hourBuckets = (
    hourRes.success ? (hourRes.data ?? []) : []
  ) as HourBucket[];
  const cashiers = (
    cashierRes.success ? (cashierRes.data ?? []) : []
  ) as CashierRow[];

  const compare: ComparePeriod | null = resolved.compare
    ? {
        start: resolved.compare.start,
        end: resolved.compare.end,
        kpis: prevKpis,
      }
    : null;

  // Pull the "sales" reconciliation row for the active range — feeds
  // the inline reconciliation card. If RPC fails we silently degrade.
  let reconcile: ReconcileSnippet | null = null;
  if (reconcileRes.success && reconcileRes.data) {
    const report = reconcileRes.data as ReconciliationReport;
    const sales = report.categories.find((c) => c.category === "sales");
    if (sales) {
      reconcile = {
        subledger_total: Number(sales.subledger_total ?? 0),
        gl_total: Number(sales.gl_total ?? 0),
        difference: Number(sales.difference ?? 0),
        start: resolved.start,
        end: resolved.end,
      };
    }
  }

  let cashVariance: CashVarianceSummary | null = null;
  if (cashVarianceRes.success && cashVarianceRes.data) {
    const raw = cashVarianceRes.data as CashVarianceSummary;
    if (Number(raw.session_count) > 0) {
      cashVariance = {
        session_count: Number(raw.session_count),
        total_variance: Number(raw.total_variance),
        abs_variance_total: Number(raw.abs_variance_total),
        short_count: Number(raw.short_count),
        short_total: Number(raw.short_total),
        over_count: Number(raw.over_count),
        over_total: Number(raw.over_total),
        worst_cashiers: Array.isArray(raw.worst_cashiers)
          ? (raw.worst_cashiers as WorstCashier[])
          : [],
      };
    }
  }

  // Work-queue health (period status, recon exceptions, cash variance,
  // food cost exceptions). Owner sees these on every Finance route via
  // the shared <WorkQueueStrip>.
  const dashboardSummary = (
    dashboardSummaryRes.success ? dashboardSummaryRes.data : null
  ) as FinanceDashboardSummary | null;

  const fiscalPeriods = fiscalPeriodsRes.success
    ? ((fiscalPeriodsRes.data ?? []) as FiscalPeriodRow[])
    : [];
  const currentPeriodYear = Number(resolved.end.slice(0, 4));
  const currentPeriodMonth = Number(resolved.end.slice(5, 7));
  const currentPeriod = fiscalPeriods.find(
    (p) =>
      p.period_year === currentPeriodYear &&
      p.period_month === currentPeriodMonth,
  );

  let reconciliationExceptionCount = 0;
  let reconciliationDifference = 0;
  if (reconcileRes.success && reconcileRes.data) {
    const report = reconcileRes.data as ReconciliationReport;
    reconciliationExceptionCount = report.categories.filter(
      (c) => Math.abs(Number(c.difference ?? 0)) > RECONCILIATION_TOLERANCE,
    ).length;
    reconciliationDifference = report.categories.reduce(
      (sum, c) => sum + Math.abs(Number(c.difference ?? 0)),
      0,
    );
  }

  const cashVarianceSessionCount = cashVariance?.session_count ?? 0;
  const cashVarianceAbsAmount = cashVariance?.abs_variance_total ?? 0;

  const foodCostRows = foodCostRes.success
    ? ((foodCostRes.data ?? []) as FinanceFoodCostRow[])
    : [];
  const foodCostExceptions = foodCostRows
    .filter(
      (row) => Number(row.food_cost_pct ?? 0) >= FOOD_COST_EXCEPTION_THRESHOLD,
    )
    .sort(
      (a, b) => Number(b.food_cost_pct ?? 0) - Number(a.food_cost_pct ?? 0),
    );
  const topFoodCostException = foodCostExceptions[0] ?? null;

  const dashboardHealth: FinanceDashboardHealth = {
    currentPeriodLabel: `T${String(currentPeriodMonth).padStart(2, "0")}/${currentPeriodYear}`,
    currentPeriodStatus: currentPeriod?.status ?? "missing",
    reconciliationExceptionCount,
    reconciliationDifference,
    cashVarianceSessionCount,
    cashVarianceAbsAmount,
    foodCostExceptionCount: foodCostExceptions.length,
    topFoodCostExceptionName: topFoodCostException?.item_name ?? null,
    topFoodCostExceptionPct:
      topFoodCostException?.food_cost_pct == null
        ? null
        : Number(topFoodCostException.food_cost_pct),
  };

  const invoiceAttentionCount = invoicesRes.success
    ? ((invoicesRes.data as { status: string }[] | null) ?? []).filter((i) =>
        ["draft", "signing", "submitted"].includes(i.status),
      ).length
    : 0;

  return (
    <RevenueClient
      params={params}
      branches={branches}
      kpis={kpis}
      compare={compare}
      rollupRows={rows}
      topItems={topItems}
      hourBuckets={hourBuckets}
      hourlyEnabled={hourlyEnabled}
      cashierEnabled={cashierEnabled}
      cashiers={cashiers}
      reconcile={reconcile}
      cashVariance={cashVariance}
      dashboardSummary={dashboardSummary}
      dashboardHealth={dashboardHealth}
      invoiceAttentionCount={invoiceAttentionCount}
      resolvedStart={resolved.start}
      resolvedEnd={resolved.end}
    />
  );
}
