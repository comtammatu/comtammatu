import { formatVND } from "@comtammatu/shared/format";
import { loadAuthState } from "@/_lib/auth";
import { fetchInventoryValueByBranch } from "@/_actions/inventory";
import { messages } from "@lib/messages";
import {
  fetchAccessibleBranches,
  fetchCashVarianceSummary,
  fetchFinanceDashboardSummary,
  fetchRevenueKpis,
  fetchRevenueRollup,
  fetchTopItems,
} from "../actions";
import { fetchFoodCost } from "../accounting-actions";
import type { FinanceParams, ResolvedFinanceRange } from "./finance-params";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

const copy = messages.finance.powerLite;

interface KpiBundle {
  net_revenue: number;
  subtotal_revenue: number;
  discount_amount: number;
  order_count: number;
  total_tax: number;
  cash_revenue: number;
  vietqr_revenue: number;
  momo_revenue: number;
}

interface RollupRow {
  period_label: string;
  period_start: string;
  branch_id: number;
  order_count: number;
  total_revenue: number | null;
  subtotal_revenue: number | null;
  discount_amount: number | null;
}

interface FoodCostRow {
  period_start: string | null;
  branch_id: number | null;
  item_name: string | null;
  revenue: number | null;
  ingredient_cost: number | null;
  food_cost_pct: number | null;
}

interface TopItemRow {
  branch_id: number;
  menu_item_id: number;
  item_name: string;
  quantity_sold: number;
  revenue: number;
}

interface CashVarianceSummary {
  session_count: number;
  total_variance: number;
  abs_variance_total: number;
}

interface BranchOption {
  id: number;
  name: string;
}

export interface FinanceCockpitKpis {
  totalCollected: number;
  orderCount: number;
  netRevenueBeforeVat: number;
  inventoryValue: number;
  operatingExpense: number;
  ingredientCost: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  cashRevenue: number;
  vietqrRevenue: number;
  momoRevenue: number;
}

export interface FinanceTrendPoint {
  x: string;
  y: number | null;
}

export interface FinanceBranchRow {
  branchId: number;
  branchName: string;
  revenue: number;
  inventoryValue: number;
  ingredientCost: number;
  grossProfit: number;
  grossMargin: number;
  cashVariance: number;
}

export interface FinanceInventoryItem {
  branchName: string;
  ingredientName: string;
  quantity: number;
  value: number;
}

export interface FinanceException {
  label: string;
  value: string;
  hint: string;
  href?: string;
  tone: "neutral" | "warning" | "destructive";
}

export interface FinanceCockpitData {
  branches: BranchOption[];
  kpis: FinanceCockpitKpis;
  compareKpis: Pick<
    FinanceCockpitKpis,
    "totalCollected" | "operatingExpense" | "grossProfit" | "netProfit"
  > | null;
  revenueTrend: FinanceTrendPoint[];
  grossProfitTrend: FinanceTrendPoint[];
  branchRows: FinanceBranchRow[];
  inventoryItems: FinanceInventoryItem[];
  topItems: TopItemRow[];
  exceptions: FinanceException[];
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function buildKpis({
  kpis,
  foodCostRows,
  inventoryValue,
  operatingExpense,
}: {
  kpis: KpiBundle | null;
  foodCostRows: FoodCostRow[];
  inventoryValue: number;
  operatingExpense: number;
}): FinanceCockpitKpis {
  const totalCollected = toNumber(kpis?.net_revenue);
  const netRevenueBeforeVat =
    toNumber(kpis?.subtotal_revenue) - toNumber(kpis?.discount_amount);
  const ingredientCost = foodCostRows.reduce(
    (sum, row) => sum + toNumber(row.ingredient_cost),
    0,
  );
  const grossProfit = netRevenueBeforeVat - ingredientCost;
  const grossMargin =
    netRevenueBeforeVat > 0 ? (grossProfit / netRevenueBeforeVat) * 100 : 0;
  const netProfit = grossProfit - operatingExpense;

  return {
    totalCollected,
    orderCount: toNumber(kpis?.order_count),
    netRevenueBeforeVat,
    inventoryValue,
    operatingExpense,
    ingredientCost,
    grossProfit,
    grossMargin,
    netProfit,
    cashRevenue: toNumber(kpis?.cash_revenue),
    vietqrRevenue: toNumber(kpis?.vietqr_revenue),
    momoRevenue: toNumber(kpis?.momo_revenue),
  };
}

export async function fetchOperatingExpenseTotal({
  supabase,
  tenantId,
  branchId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  branchId: number | null;
  startDate: string;
  endDate: string;
}): Promise<number> {
  let query = supabase
    .from("expenses")
    .select("amount")
    .eq("tenant_id", tenantId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return 0;
  return (data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0);
}

async function fetchUnpaidSupplierInvoiceRisk({
  supabase,
  tenantId,
}: {
  supabase: SupabaseClient;
  tenantId: number;
}): Promise<{ count: number; amount: number }> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("total_amount, paid_amount, payment_status")
    .eq("tenant_id", tenantId)
    .neq("payment_status", "paid");

  if (error) return { count: 0, amount: 0 };

  return (data ?? []).reduce(
    (acc, row) => {
      acc.count += 1;
      acc.amount += Math.max(
        0,
        toNumber(row.total_amount) - toNumber(row.paid_amount),
      );
      return acc;
    },
    { count: 0, amount: 0 },
  );
}

async function fetchInventoryCashTiedItems({
  supabase,
  tenantId,
  branchId,
  branches,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  branchId: number | null;
  branches: BranchOption[];
}): Promise<FinanceInventoryItem[]> {
  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  let query = supabase
    .from("stock_levels")
    .select(
      `
      branch_id,
      current_quantity,
      avg_unit_cost,
      ingredients ( name, unit_cost )
    `,
    )
    .eq("tenant_id", tenantId);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return [];

  return (data ?? [])
    .map((row) => {
      const ingredient = row.ingredients as {
        name: string | null;
        unit_cost: number | string | null;
      } | null;
      const unitCost =
        row.avg_unit_cost != null
          ? toNumber(row.avg_unit_cost)
          : toNumber(ingredient?.unit_cost);
      return {
        branchName:
          branchNames.get(row.branch_id) ?? copy.branchFallback(row.branch_id),
        ingredientName: ingredient?.name ?? copy.ingredientFallback,
        quantity: toNumber(row.current_quantity),
        value: toNumber(row.current_quantity) * unitCost,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function buildTrends(rollups: RollupRow[], foodCostRows: FoodCostRow[]) {
  const costByPeriod = new Map<string, number>();
  for (const row of foodCostRows) {
    if (!row.period_start) continue;
    costByPeriod.set(
      row.period_start,
      (costByPeriod.get(row.period_start) ?? 0) + toNumber(row.ingredient_cost),
    );
  }

  const byPeriod = new Map<
    string,
    { label: string; revenue: number; beforeVat: number }
  >();
  for (const row of rollups) {
    const current = byPeriod.get(row.period_start) ?? {
      label: row.period_label,
      revenue: 0,
      beforeVat: 0,
    };
    current.revenue += toNumber(row.total_revenue);
    current.beforeVat +=
      toNumber(row.subtotal_revenue) - toNumber(row.discount_amount);
    byPeriod.set(row.period_start, current);
  }

  const ordered = Array.from(byPeriod.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return {
    revenueTrend: ordered.map(([period, row]) => ({
      x: row.label,
      y: row.revenue,
      key: period,
    })),
    grossProfitTrend: ordered.map(([period, row]) => ({
      x: row.label,
      y: row.beforeVat - (costByPeriod.get(period) ?? 0),
    })),
  };
}

function buildBranchRows({
  branches,
  rollups,
  foodCostRows,
  inventoryRows,
  cashVarianceByBranch,
}: {
  branches: BranchOption[];
  rollups: RollupRow[];
  foodCostRows: FoodCostRow[];
  inventoryRows: Array<{ branchId: number; totalValue: number }>;
  cashVarianceByBranch: Map<number, number>;
}): FinanceBranchRow[] {
  const rows = new Map<number, FinanceBranchRow>();
  for (const branch of branches) {
    rows.set(branch.id, {
      branchId: branch.id,
      branchName: branch.name,
      revenue: 0,
      inventoryValue:
        inventoryRows.find((row) => row.branchId === branch.id)?.totalValue ??
        0,
      ingredientCost: 0,
      grossProfit: 0,
      grossMargin: 0,
      cashVariance: cashVarianceByBranch.get(branch.id) ?? 0,
    });
  }

  for (const row of rollups) {
    const branch = rows.get(row.branch_id);
    if (!branch) continue;
    branch.revenue += toNumber(row.total_revenue);
    branch.grossProfit +=
      toNumber(row.subtotal_revenue) - toNumber(row.discount_amount);
  }

  for (const row of foodCostRows) {
    if (row.branch_id == null) continue;
    const branch = rows.get(row.branch_id);
    if (!branch) continue;
    branch.ingredientCost += toNumber(row.ingredient_cost);
  }

  for (const row of rows.values()) {
    row.grossProfit -= row.ingredientCost;
    const beforeCost = row.grossProfit + row.ingredientCost;
    row.grossMargin = beforeCost > 0 ? (row.grossProfit / beforeCost) * 100 : 0;
  }

  return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
}

function buildExceptions({
  kpis,
  dashboardSummary,
  cashVariance,
  foodCostRows,
  unpaidSupplierInvoices,
}: {
  kpis: FinanceCockpitKpis;
  dashboardSummary: { invoice_attention_count: number } | null;
  cashVariance: CashVarianceSummary | null;
  foodCostRows: FoodCostRow[];
  unpaidSupplierInvoices: { count: number; amount: number };
}): FinanceException[] {
  const missingCostCount = foodCostRows.filter(
    (row) => toNumber(row.revenue) > 0 && toNumber(row.ingredient_cost) <= 0,
  ).length;
  const highFoodCost = foodCostRows
    .filter((row) => toNumber(row.food_cost_pct) >= 60)
    .sort((a, b) => toNumber(b.food_cost_pct) - toNumber(a.food_cost_pct))[0];

  return [
    {
      label: copy.exceptions.cashVarianceLabel,
      value: formatVND(toNumber(cashVariance?.abs_variance_total)),
      hint:
        toNumber(cashVariance?.session_count) > 0
          ? copy.exceptions.cashVarianceClosedSessions(
              formatCount(toNumber(cashVariance?.session_count)),
            )
          : copy.exceptions.cashVarianceNoClosedSession,
      href: "/finance/revenue",
      tone:
        toNumber(cashVariance?.abs_variance_total) >= 500_000
          ? "destructive"
          : toNumber(cashVariance?.abs_variance_total) > 0
            ? "warning"
            : "neutral",
    },
    {
      label: copy.exceptions.operatingExpenseLabel,
      value: formatVND(kpis.operatingExpense),
      hint:
        kpis.operatingExpense > 0
          ? copy.exceptions.operatingExpenseRecorded
          : copy.exceptions.operatingExpenseMissing,
      tone: kpis.operatingExpense > 0 ? "neutral" : "warning",
    },
    {
      label: copy.exceptions.missingCostLabel,
      value: formatCount(missingCostCount),
      hint:
        missingCostCount > 0
          ? copy.exceptions.missingCostHint
          : highFoodCost
            ? copy.exceptions.highFoodCostHint(
                highFoodCost.item_name ?? copy.exceptions.unnamedMenuItem,
                formatPercent(toNumber(highFoodCost.food_cost_pct)),
              )
            : copy.exceptions.costDataClear,
      href: "/finance/food-cost",
      tone: missingCostCount > 0 || highFoodCost ? "warning" : "neutral",
    },
    {
      label: copy.exceptions.invoiceAttentionLabel,
      value: formatCount(dashboardSummary?.invoice_attention_count ?? 0),
      hint: copy.exceptions.invoiceAttentionHint,
      href: "/finance/invoices",
      tone:
        (dashboardSummary?.invoice_attention_count ?? 0) > 0
          ? "warning"
          : "neutral",
    },
    {
      label: copy.exceptions.supplierInvoiceLabel,
      value: formatVND(unpaidSupplierInvoices.amount),
      hint: copy.exceptions.supplierInvoiceHint(
        formatCount(unpaidSupplierInvoices.count),
      ),
      href: "/inventory/supplier-invoices",
      tone: unpaidSupplierInvoices.count > 0 ? "warning" : "neutral",
    },
  ];
}

export async function fetchFinanceCockpit(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<FinanceCockpitData> {
  const { supabase, claims } = await loadAuthState();

  const [
    branchesRes,
    kpisRes,
    compareKpisRes,
    rollupRes,
    foodCostRes,
    compareFoodCostRes,
    inventoryValueRes,
    cashVarianceRes,
    dashboardSummaryRes,
    topItemsRes,
    operatingExpense,
    compareOperatingExpense,
    unpaidSupplierInvoices,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchRevenueKpis(params.branch, resolved.start, resolved.end),
    resolved.compare
      ? fetchRevenueKpis(
          params.branch,
          resolved.compare.start,
          resolved.compare.end,
        )
      : Promise.resolve({ success: true as const, data: null }),
    fetchRevenueRollup(params.branch, resolved.start, resolved.end, "day"),
    fetchFoodCost({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    resolved.compare
      ? fetchFoodCost({
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
          ...(params.branch != null ? { branchId: params.branch } : {}),
        })
      : Promise.resolve({ success: true as const, data: [] }),
    fetchInventoryValueByBranch(),
    fetchCashVarianceSummary(params.branch, resolved.start, resolved.end),
    fetchFinanceDashboardSummary(params.branch, resolved.start, resolved.end),
    fetchTopItems(params.branch, resolved.start, resolved.end),
    fetchOperatingExpenseTotal({
      supabase,
      tenantId: claims.tenant_id,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    resolved.compare
      ? fetchOperatingExpenseTotal({
          supabase,
          tenantId: claims.tenant_id,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
        })
      : Promise.resolve(0),
    fetchUnpaidSupplierInvoiceRisk({
      supabase,
      tenantId: claims.tenant_id,
    }),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as BranchOption[];
  const foodCostRows = (
    foodCostRes.success ? (foodCostRes.data ?? []) : []
  ) as FoodCostRow[];
  const compareFoodCostRows = (
    compareFoodCostRes.success ? (compareFoodCostRes.data ?? []) : []
  ) as FoodCostRow[];
  const inventoryRows = inventoryValueRes.success
    ? (inventoryValueRes.data?.rows ?? [])
    : [];
  const inventoryValue =
    params.branch == null
      ? inventoryRows.reduce((sum, row) => sum + row.totalValue, 0)
      : (inventoryRows.find((row) => row.branchId === params.branch)
          ?.totalValue ?? 0);

  const kpis = buildKpis({
    kpis: kpisRes.success ? (kpisRes.data as KpiBundle | null) : null,
    foodCostRows,
    inventoryValue,
    operatingExpense,
  });

  const compareKpis = resolved.compare
    ? buildKpis({
        kpis: compareKpisRes.success
          ? (compareKpisRes.data as KpiBundle | null)
          : null,
        foodCostRows: compareFoodCostRows,
        inventoryValue,
        operatingExpense: compareOperatingExpense,
      })
    : null;

  const rollups = (
    rollupRes.success ? (rollupRes.data ?? []) : []
  ) as RollupRow[];
  const { revenueTrend, grossProfitTrend } = buildTrends(rollups, foodCostRows);

  const branchCashVariance = new Map<number, number>();
  if (branches.length > 1) {
    const varianceRows = await Promise.all(
      branches.map(async (branch) => {
        const res = await fetchCashVarianceSummary(
          branch.id,
          resolved.start,
          resolved.end,
        );
        const row = (
          res.success ? res.data : null
        ) as CashVarianceSummary | null;
        return [branch.id, toNumber(row?.abs_variance_total)] as const;
      }),
    );
    for (const [branchId, amount] of varianceRows) {
      branchCashVariance.set(branchId, amount);
    }
  }

  return {
    branches,
    kpis,
    compareKpis: compareKpis
      ? {
          totalCollected: compareKpis.totalCollected,
          operatingExpense: compareKpis.operatingExpense,
          grossProfit: compareKpis.grossProfit,
          netProfit: compareKpis.netProfit,
        }
      : null,
    revenueTrend,
    grossProfitTrend,
    branchRows: buildBranchRows({
      branches,
      rollups,
      foodCostRows,
      inventoryRows,
      cashVarianceByBranch: branchCashVariance,
    }),
    inventoryItems: await fetchInventoryCashTiedItems({
      supabase,
      tenantId: claims.tenant_id,
      branchId: params.branch,
      branches,
    }),
    topItems: (topItemsRes.success
      ? (topItemsRes.data ?? [])
      : []) as TopItemRow[],
    exceptions: buildExceptions({
      kpis,
      dashboardSummary: dashboardSummaryRes.success
        ? (dashboardSummaryRes.data as {
            invoice_attention_count: number;
          } | null)
        : null,
      cashVariance: cashVarianceRes.success
        ? (cashVarianceRes.data as CashVarianceSummary | null)
        : null,
      foodCostRows,
      unpaidSupplierInvoices,
    }),
  };
}
