import { PageHero } from "@/components/page-hero";
import { messages } from "@lib/messages";
import { FinanceClient } from "./finance-client";
import {
  fetchAccessibleBranches,
  fetchCashVarianceSummary,
  fetchFinanceDashboardSummary,
  fetchRevenueRollup,
  fetchRevenueKpis,
  fetchTaxInvoices,
  fetchTopItems,
} from "./actions";
import { fetchFoodCost } from "./accounting-actions";
import { fetchFiscalPeriods } from "./period-actions";
import {
  fetchReconciliation,
  type ReconciliationReport,
} from "./reconciliation-actions";
import type {
  AccessibleBranch,
  CashVarianceSummary,
  KpiBundle,
  RollupRow,
} from "./revenue/page";
import type { FinanceDashboardSummary } from "./actions";

export type FinanceLayoutMode = "simple" | "advanced";

const RECONCILIATION_TOLERANCE = 1;
const FOOD_COST_EXCEPTION_THRESHOLD = 60;

function isFinanceLayoutMode(
  value: string | undefined,
): value is FinanceLayoutMode {
  return value === "simple" || value === "advanced";
}

function formatDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function rollupToDailyRevenue(rows: RollupRow[]): DailyRevenueRow[] {
  const map = new Map<string, DailyRevenueRow>();
  for (const row of rows) {
    const existing = map.get(row.period_start);
    if (existing) {
      existing.order_count += row.order_count;
      existing.total_revenue =
        (existing.total_revenue ?? 0) + (row.total_revenue ?? 0);
      existing.total_tax = (existing.total_tax ?? 0) + (row.total_tax ?? 0);
      existing.cash_revenue =
        (existing.cash_revenue ?? 0) + (row.cash_revenue ?? 0);
      existing.vietqr_revenue =
        (existing.vietqr_revenue ?? 0) + (row.vietqr_revenue ?? 0);
      existing.momo_revenue =
        (existing.momo_revenue ?? 0) + (row.momo_revenue ?? 0);
    } else {
      map.set(row.period_start, {
        date: row.period_start,
        branch_id: row.branch_id,
        tenant_id: 0,
        order_count: row.order_count,
        total_revenue: row.total_revenue,
        total_tax: row.total_tax,
        cash_revenue: row.cash_revenue,
        vietqr_revenue: row.vietqr_revenue,
        momo_revenue: row.momo_revenue,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; branch?: string }>;
}) {
  const params = await searchParams;
  const layout = isFinanceLayoutMode(params.layout) ? params.layout : "simple";

  const today = formatDateInZone(new Date(), "Asia/Ho_Chi_Minh");
  const yesterday = formatDateInZone(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
    "Asia/Ho_Chi_Minh",
  );
  const startDate = formatDateInZone(
    new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
    "Asia/Ho_Chi_Minh",
  );
  const endDate = today;

  // periodStart for mv_top_items — first day of current month
  const periodStart = `${today.slice(0, 7)}-01`;

  const branchesRes = await fetchAccessibleBranches();
  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];
  const parsedBranch =
    params.branch && params.branch !== "all" ? Number(params.branch) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0 ? parsedBranch : null;

  const [
    dailyRevenueRes,
    topItemsRes,
    invoicesRes,
    todayKpisRes,
    yesterdayKpisRes,
    monthKpisRes,
    dashboardSummaryRes,
    fiscalPeriodsRes,
    reconciliationRes,
    cashVarianceRes,
    foodCostRes,
  ] = await Promise.all([
    fetchRevenueRollup(branchId, startDate, endDate, "day"),
    fetchTopItems(branchId, periodStart),
    fetchTaxInvoices(branchId ?? undefined),
    fetchRevenueKpis(branchId, today, today),
    fetchRevenueKpis(branchId, yesterday, yesterday),
    fetchRevenueKpis(branchId, periodStart, today),
    fetchFinanceDashboardSummary(branchId, periodStart, today),
    fetchFiscalPeriods(),
    fetchReconciliation({ branchId, startDate: periodStart, endDate: today }),
    fetchCashVarianceSummary(branchId, periodStart, today),
    fetchFoodCost({
      startDate: periodStart,
      endDate: today,
      ...(branchId != null ? { branchId } : {}),
    }),
  ]);

  const dailyRevenue = dailyRevenueRes.success
    ? rollupToDailyRevenue((dailyRevenueRes.data ?? []) as RollupRow[])
    : [];
  const topItems = topItemsRes.success
    ? ((topItemsRes.data ?? []) as TopItemRow[])
    : [];
  const invoices = invoicesRes.success
    ? ((invoicesRes.data ?? []) as InvoiceRow[])
    : [];
  const todayKpis = (
    todayKpisRes.success ? todayKpisRes.data : null
  ) as KpiBundle | null;
  const yesterdayKpis = (
    yesterdayKpisRes.success ? yesterdayKpisRes.data : null
  ) as KpiBundle | null;
  const monthKpis = (
    monthKpisRes.success ? monthKpisRes.data : null
  ) as KpiBundle | null;
  const dashboardSummary = (
    dashboardSummaryRes.success ? dashboardSummaryRes.data : null
  ) as FinanceDashboardSummary | null;

  const currentPeriodYear = Number(today.slice(0, 4));
  const currentPeriodMonth = Number(today.slice(5, 7));
  const fiscalPeriods = fiscalPeriodsRes.success
    ? ((fiscalPeriodsRes.data ?? []) as FiscalPeriodRow[])
    : [];
  const currentPeriod = fiscalPeriods.find(
    (period) =>
      period.period_year === currentPeriodYear &&
      period.period_month === currentPeriodMonth,
  );

  let reconciliationExceptionCount = 0;
  let reconciliationDifference = 0;
  if (reconciliationRes.success && reconciliationRes.data) {
    const report = reconciliationRes.data as ReconciliationReport;
    reconciliationExceptionCount = report.categories.filter(
      (category) =>
        Math.abs(Number(category.difference ?? 0)) > RECONCILIATION_TOLERANCE,
    ).length;
    reconciliationDifference = report.categories.reduce(
      (sum, category) => sum + Math.abs(Number(category.difference ?? 0)),
      0,
    );
  }

  let cashVarianceSessionCount = 0;
  let cashVarianceAbsAmount = 0;
  if (cashVarianceRes.success && cashVarianceRes.data) {
    const raw = cashVarianceRes.data as CashVarianceSummary;
    cashVarianceSessionCount = Number(raw.session_count ?? 0);
    cashVarianceAbsAmount = Number(raw.abs_variance_total ?? 0);
  }

  const foodCostRows = foodCostRes.success
    ? ((foodCostRes.data ?? []) as FinanceFoodCostRow[])
    : [];
  const foodCostExceptions = foodCostRows
    .filter(
      (row) =>
        Number(row.food_cost_pct ?? 0) >= FOOD_COST_EXCEPTION_THRESHOLD,
    )
    .sort(
      (a, b) =>
        Number(b.food_cost_pct ?? 0) - Number(a.food_cost_pct ?? 0),
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

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHero
        eyebrow={messages.finance.page.eyebrow}
        title={messages.finance.page.title}
        description={messages.finance.page.description}
      />
      <FinanceClient
        layout={layout}
        branches={branches}
        branchId={branchId}
        today={today}
        periodStart={periodStart}
        todayKpis={todayKpis}
        yesterdayKpis={yesterdayKpis}
        monthKpis={monthKpis}
        dailyRevenue={dailyRevenue}
        topItems={topItems}
        invoices={invoices}
        dashboardSummary={dashboardSummary}
        dashboardHealth={dashboardHealth}
      />
    </div>
  );
}

// ─── Shared row types (used by all client components) ─────────────────────────

export interface DailyRevenueRow {
  date: string;
  branch_id: number;
  tenant_id: number;
  order_count: number;
  total_revenue: number | null;
  total_tax: number | null;
  cash_revenue: number | null;
  vietqr_revenue: number | null;
  momo_revenue: number | null;
}

export interface TopItemRow {
  period_start: string;
  period_end: string;
  branch_id: number;
  tenant_id: number;
  menu_item_id: number;
  item_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface InvoiceRow {
  id: number;
  invoice_number: string | null;
  status: string;
  buyer_name: string | null;
  buyer_tax_code: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  orders: { order_number: string } | null;
}

export interface FiscalPeriodRow {
  id: number;
  period_month: number;
  period_year: number;
  status: string;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface FinanceFoodCostRow {
  item_name: string | null;
  food_cost_pct: number | null;
}

export interface FinanceDashboardHealth {
  currentPeriodLabel: string;
  currentPeriodStatus: string;
  reconciliationExceptionCount: number;
  reconciliationDifference: number;
  cashVarianceSessionCount: number;
  cashVarianceAbsAmount: number;
  foodCostExceptionCount: number;
  topFoodCostExceptionName: string | null;
  topFoodCostExceptionPct: number | null;
}

export type { FinanceDashboardSummary } from "./actions";
