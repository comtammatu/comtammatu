import {
  fetchAccessibleBranches,
  fetchCashVarianceSummary,
  fetchRevenueKpis,
  fetchRevenueRollup,
  type RevenueGranularity,
} from "../actions";
import type { FinanceLayoutMode } from "../page";
import {
  fetchReconciliation,
  type ReconciliationReport,
} from "../reconciliation-actions";
import { RevenueClient } from "./revenue-client";

const VALID_GRANULARITIES: readonly RevenueGranularity[] = [
  "day",
  "week",
  "month",
] as const;
const VALID_LAYOUTS: readonly FinanceLayoutMode[] = ["simple", "advanced"];

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

export interface AccessibleBranch {
  id: number;
  name: string;
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

function isValidIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function defaultRangeFor(granularity: RevenueGranularity): {
  start: string;
  end: string;
} {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const d = new Date(today);
  if (granularity === "day") d.setDate(d.getDate() - 29);
  else if (granularity === "week") d.setDate(d.getDate() - 7 * 12);
  else d.setMonth(d.getMonth() - 12);
  return { start: d.toISOString().slice(0, 10), end };
}

// Prev period = same length, ending the day before current start.
// Day-count length keeps WoW/MoM "vs same number of days" rather than
// "calendar prev month" — owner thấy delta là apples-to-apples.
function prevPeriodFor(
  start: string,
  end: string,
): { start: string; end: string } {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const lengthMs = endMs - startMs; // inclusive length in ms
  const prevEndMs = startMs - 24 * 60 * 60 * 1000;
  const prevStartMs = prevEndMs - lengthMs;
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: toIso(prevStartMs), end: toIso(prevEndMs) };
}

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string;
    granularity?: string;
    start?: string;
    end?: string;
    compare?: string;
    layout?: string;
  }>;
}) {
  const sp = await searchParams;

  const granularity = (
    VALID_GRANULARITIES.includes(sp.granularity as RevenueGranularity)
      ? sp.granularity
      : "day"
  ) as RevenueGranularity;

  const fallbackRange = defaultRangeFor(granularity);
  const startDate = isValidIsoDate(sp.start) ? sp.start : fallbackRange.start;
  const endDate = isValidIsoDate(sp.end) ? sp.end : fallbackRange.end;

  // branch="all" or missing -> null = aggregate every accessible branch.
  const branchParam = sp.branch;
  const parsedBranch =
    branchParam && branchParam !== "all" ? Number(branchParam) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0 ? parsedBranch : null;

  const compareEnabled = sp.compare === "prev";
  const prevRange = compareEnabled ? prevPeriodFor(startDate, endDate) : null;
  const layout = VALID_LAYOUTS.includes(sp.layout as FinanceLayoutMode)
    ? (sp.layout as FinanceLayoutMode)
    : "simple";

  const [
    branchesRes,
    rollupRes,
    kpisRes,
    prevKpisRes,
    reconcileRes,
    cashVarianceRes,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchRevenueRollup(branchId, startDate, endDate, granularity),
    fetchRevenueKpis(branchId, startDate, endDate),
    prevRange
      ? fetchRevenueKpis(branchId, prevRange.start, prevRange.end)
      : Promise.resolve({ success: true as const, data: null }),
    fetchReconciliation({
      branchId,
      startDate,
      endDate,
    }),
    fetchCashVarianceSummary(branchId, startDate, endDate),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];
  const rows = (rollupRes.success ? (rollupRes.data ?? []) : []) as RollupRow[];
  const kpis = (kpisRes.success ? kpisRes.data : null) as KpiBundle | null;
  const prevKpis = (
    prevKpisRes.success ? prevKpisRes.data : null
  ) as KpiBundle | null;

  const compare: ComparePeriod | null =
    compareEnabled && prevRange
      ? { start: prevRange.start, end: prevRange.end, kpis: prevKpis }
      : null;

  // Pull the "sales" category (POS revenue vs GL credit on 511+33311) for
  // the current period — answers "tại sao Revenue page và Statements page
  // chênh nhau". If reconciliation fails (RPC missing posting setup, etc),
  // we silently degrade so the revenue surface keeps loading.
  let reconcile: ReconcileSnippet | null = null;
  if (reconcileRes.success && reconcileRes.data) {
    const report = reconcileRes.data as ReconciliationReport;
    const sales = report.categories.find((c) => c.category === "sales");
    if (sales) {
      reconcile = {
        subledger_total: Number(sales.subledger_total ?? 0),
        gl_total: Number(sales.gl_total ?? 0),
        difference: Number(sales.difference ?? 0),
        start: startDate,
        end: endDate,
      };
    }
  }

  const errorMessage = rollupRes.success ? null : rollupRes.error;

  // Cash variance — pos_sessions.cash_difference đã closed trong khoảng.
  // Silently degrade nếu RPC fail (deploy thiếu, ACL...) để main page vẫn
  // load. Chỉ show card khi có ≥1 session để tránh empty noise.
  let cashVariance: CashVarianceSummary | null = null;
  if (cashVarianceRes.success && cashVarianceRes.data) {
    const raw = cashVarianceRes.data as {
      session_count: number;
      total_variance: number;
      abs_variance_total: number;
      short_count: number;
      short_total: number;
      over_count: number;
      over_total: number;
      worst_cashiers: unknown;
    };
    if (raw.session_count > 0) {
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

  return (
    <RevenueClient
      branches={branches}
      initialBranchId={branchId}
      initialRows={rows}
      initialKpis={kpis}
      initialCompare={compare}
      initialReconcile={reconcile}
      initialCashVariance={cashVariance}
      initialStart={startDate}
      initialEnd={endDate}
      initialGranularity={granularity}
      initialLayout={layout}
      initialError={errorMessage ?? null}
    />
  );
}
