import {
  fetchAccessibleBranches,
  fetchCashVarianceSummary,
  fetchFinanceDashboardSummary,
  fetchRevenueByCashier,
  fetchRevenueByHour,
  fetchRevenueKpis,
  fetchRevenueRollup,
  fetchTopItems,
  type FinanceDashboardSummary,
} from "../../actions";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import { diffVNDateDays } from "@comtammatu/shared/time";
import type {
  FinanceDashboardHealth,
  TopItemRow,
} from "../../_lib/finance-types";
import type {
  FinanceParams,
  ResolvedFinanceRange,
} from "../../_lib/finance-params";
import type {
  AccessibleBranch,
  CashVarianceSummary,
  CashierRow,
  ComparePeriod,
  FinanceFoodCostRow,
  HourBucket,
  KpiBundle,
  RollupRow,
  WorstCashier,
} from "./finance-types-revenue";

const FOOD_COST_EXCEPTION_THRESHOLD = 60;
// Hour-of-day RPC caps at 90d. The contract gives owners up to YTD on
// the same surface, so when the resolved range exceeds 90d we skip
// fetching the heatmap and show an inline "range too large" hint.
const HOURLY_MAX_DAYS = 90;

function diffDays(start: string, end: string): number {
  return Math.max(0, diffVNDateDays(start, end) + 1);
}

export interface RevenueBundle {
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
}

export async function loadRevenueBundle(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<RevenueBundle> {
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
    cashVarianceRes,
    topItemsRes,
    hourRes,
    cashierRes,
    dashboardSummaryRes,
    foodCostRes,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchRevenueRollup(params.branch, resolved.start, resolved.end, params.gran),
    fetchRevenueKpis(params.branch, resolved.start, resolved.end),
    resolved.compare
      ? fetchRevenueKpis(
          params.branch,
          resolved.compare.start,
          resolved.compare.end,
        )
      : Promise.resolve({ success: true as const, data: null }),
    fetchCashVarianceSummary(params.branch, resolved.start, resolved.end),
    fetchTopItems(params.branch, resolved.start, resolved.end),
    hourlyEnabled
      ? fetchRevenueByHour(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: [] }),
    cashierEnabled
      ? fetchRevenueByCashier(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: [] }),
    fetchFinanceDashboardSummary(params.branch, resolved.start, resolved.end),
    fetchFoodCost({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
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

  // Work-queue health (cash variance, food cost exceptions) via the
  // shared <WorkQueueStrip>.
  const dashboardSummary = (
    dashboardSummaryRes.success ? dashboardSummaryRes.data : null
  ) as FinanceDashboardSummary | null;

  const cashVarianceSessionCount = cashVariance?.session_count ?? 0;
  const cashVarianceAbsAmount = cashVariance?.abs_variance_total ?? 0;

  const foodCostRows = foodCostRes.success
    ? ((foodCostRes.data ?? []) as FinanceFoodCostRow[])
    : [];
  const foodCostExceptions = foodCostRows
    .filter(
      (row) => Number(row.food_cost_pct ?? 0) >= FOOD_COST_EXCEPTION_THRESHOLD,
    )
    .sort((a, b) => Number(b.food_cost_pct ?? 0) - Number(a.food_cost_pct ?? 0));
  const topFoodCostException = foodCostExceptions[0] ?? null;

  const dashboardHealth: FinanceDashboardHealth = {
    cashVarianceSessionCount,
    cashVarianceAbsAmount,
    foodCostExceptionCount: foodCostExceptions.length,
    topFoodCostExceptionName: topFoodCostException?.item_name ?? null,
    topFoodCostExceptionPct:
      topFoodCostException?.food_cost_pct == null
        ? null
        : Number(topFoodCostException.food_cost_pct),
  };

  return {
    branches,
    kpis,
    compare,
    rollupRows: rows,
    topItems,
    hourBuckets,
    hourlyEnabled,
    cashierEnabled,
    cashiers,
    cashVariance,
    dashboardSummary,
    dashboardHealth,
  };
}
