import {
  formatAccountingVND as formatVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import {
  fetchInventoryPeriodValue,
  fetchInventoryValueByBranch,
} from "@/(protected)/inventory/inventory-value-actions";
import { messages } from "@lib/messages";
import {
  fetchAccessibleBranches,
  fetchCashVarianceSummary,
  fetchFinanceDashboardSummary,
  fetchRevenueKpis,
  fetchRevenueRollup,
  fetchTopItems,
  type FinanceDashboardSummary,
} from "../actions";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import type { FinanceParams, ResolvedFinanceRange } from "./finance-params";
import { calculateFinanceResult } from "./finance-result";
import { fetchStockBearingLocationIds } from "../../inventory/_lib/stock-bearing-locations";
import { isOperatingExpenseCategory } from "./expense-categories";

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

interface ActualFoodCostSnapshot {
  rows: FoodCostRow[];
  orderCount: number;
}

interface OperatingExpenseSummary {
  total: number;
  recorded: boolean;
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

interface CashVarianceActionTarget {
  session_id: number;
  branch_id: number;
  cash_difference: number | string;
}

interface FinanceReconciliationAttention {
  unmatched_bank_count: number | string;
  unmatched_bank_amount: number | string;
  unmatched_money_in_count: number | string;
  unmatched_money_out_count: number | string;
  missing_vietqr_count: number | string;
  missing_vietqr_amount: number | string;
}

interface BranchOption {
  id: number;
  name: string;
}

interface FinanceCockpitKpis {
  totalCollected: number;
  orderCount: number;
  netRevenueBeforeVat: number;
  inventoryValue: number;
  inventoryOpeningValue: number;
  operatingExpense: number;
  operatingExpenseRecorded: boolean;
  ingredientCost: number;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingResult: number | null;
  costAvailable: boolean;
  costCoverageOrderCount: number;
  costCoverageRatio: number;
  cashRevenue: number;
  vietqrRevenue: number;
}

interface FinanceTrendPoint {
  x: string;
  y: number | null;
}

interface FinanceBranchRow {
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
  canViewInventoryValuation: boolean;
  kpis: FinanceCockpitKpis;
  compareKpis: Pick<
    FinanceCockpitKpis,
    | "totalCollected"
    | "netRevenueBeforeVat"
    | "orderCount"
    | "operatingExpense"
    | "ingredientCost"
    | "grossProfit"
    | "costAvailable"
  > | null;
  revenueTrend: FinanceTrendPoint[];
  grossProfitTrend: FinanceTrendPoint[];
  branchRows: FinanceBranchRow[];
  inventoryItems: FinanceInventoryItem[];
  topItems: TopItemRow[];
  exceptions: FinanceException[];
  dashboardSummary: FinanceDashboardSummary | null;
}

async function fetchCashVarianceActionTarget({
  supabase,
  branchId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  branchId: number | null;
  startDate: string;
  endDate: string;
}): Promise<CashVarianceActionTarget | null> {
  const { data, error } = await supabase.rpc(
    "get_cash_variance_action_target",
    {
      p_branch_id: branchId as number,
      p_start_date: startDate,
      p_end_date: endDate,
    },
  );
  if (error) {
    console.error("[finance:cash-variance-target] RPC failed", error.code);
    return null;
  }
  return (data?.[0] as CashVarianceActionTarget | undefined) ?? null;
}

async function fetchFinanceReconciliationAttention({
  supabase,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  startDate: string;
  endDate: string;
}): Promise<FinanceReconciliationAttention | null> {
  const { data, error } = await supabase.rpc(
    "get_finance_reconciliation_attention",
    {
      p_start_date: startDate,
      p_end_date: endDate,
    },
  );
  if (error) {
    console.error("[finance:reconciliation-attention] RPC failed", error.code);
    return null;
  }
  return (data?.[0] as FinanceReconciliationAttention | undefined) ?? null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildKpis({
  kpis,
  actualFoodCost,
  inventoryValue,
  inventoryOpeningValue = inventoryValue,
  operatingExpense,
}: {
  kpis: KpiBundle | null;
  actualFoodCost: ActualFoodCostSnapshot;
  inventoryValue: number;
  inventoryOpeningValue?: number;
  operatingExpense: OperatingExpenseSummary;
}): FinanceCockpitKpis {
  const totalCollected = toNumber(kpis?.net_revenue);
  const orderCount = toNumber(kpis?.order_count);
  const netRevenueBeforeVat =
    toNumber(kpis?.subtotal_revenue) - toNumber(kpis?.discount_amount);
  const ingredientCost = actualFoodCost.rows.reduce(
    (sum, row) => sum + toNumber(row.ingredient_cost),
    0,
  );
  const costCoverageOrderCount = actualFoodCost.orderCount;
  const costCoverageRatio =
    orderCount > 0 ? costCoverageOrderCount / orderCount : 1;
  const costAvailable =
    orderCount === 0 || costCoverageOrderCount >= orderCount;
  const financeResult = calculateFinanceResult({
    netRevenueBeforeVat,
    ingredientCost,
    operatingExpense: operatingExpense.total,
    costAvailable,
    operatingExpenseRecorded: operatingExpense.recorded,
  });

  return {
    totalCollected,
    orderCount,
    netRevenueBeforeVat,
    inventoryValue,
    inventoryOpeningValue,
    operatingExpense: operatingExpense.total,
    operatingExpenseRecorded: operatingExpense.recorded,
    ingredientCost,
    ...financeResult,
    costAvailable,
    costCoverageOrderCount,
    costCoverageRatio,
    cashRevenue: toNumber(kpis?.cash_revenue),
    vietqrRevenue: toNumber(kpis?.vietqr_revenue),
  };
}

export async function fetchOperatingExpenseSummary({
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
}): Promise<OperatingExpenseSummary> {
  let query = supabase
    .from("expenses")
    .select("amount, category")
    .eq("tenant_id", tenantId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return { total: 0, recorded: false };

  const operatingRows = (data ?? []).filter((row) =>
    isOperatingExpenseCategory(row.category),
  );

  return {
    total: operatingRows.reduce(
      (sum, row) => sum + toNumber(row.amount),
      0,
    ),
    recorded: operatingRows.length > 0,
  };
}

async function fetchUnpaidSupplierInvoiceRisk({
  supabase,
  tenantId,
  branchId,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  branchId: number | null;
}): Promise<{ count: number; amount: number }> {
  const select =
    branchId != null
      ? "total_amount, paid_amount, credit_applied_amount, payment_status, goods_received_notes!inner(branch_id)"
      : "total_amount, paid_amount, credit_applied_amount, payment_status";

  let query = supabase
    .from("supplier_invoices")
    .select(select)
    .eq("tenant_id", tenantId)
    .neq("payment_status", "paid");

  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) return { count: 0, amount: 0 };

  const rows = (data ?? []) as unknown as Array<{
    total_amount: number | string | null;
    paid_amount: number | string | null;
    credit_applied_amount: number | string | null;
  }>;

  return rows.reduce(
    (acc, row) => {
      const outstanding = Math.max(
        0,
        toNumber(row.total_amount) -
          toNumber(row.paid_amount) -
          toNumber(row.credit_applied_amount),
      );
      if (outstanding <= 0) return acc;
      acc.count += 1;
      acc.amount += outstanding;
      return acc;
    },
    { count: 0, amount: 0 },
  );
}

// Payment/order desync ops alert: completed payments whose order is not marked
// paid (the orphan-gateway risk from POS calling the provider before the DB
// lock). Reuses the finance:view-gated RPC and narrows its lookback to the
// selected Vietnam-local period and branch.
async function fetchPaymentOrderDesync({
  supabase,
  branchId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  branchId: number | null;
  startDate: string;
  endDate: string;
}): Promise<{ count: number; amount: number }> {
  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  let query = supabase
    .rpc("find_payment_order_desync", { p_since: startIso })
    .lt("payment_paid_at", endIso);
  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }
  const { data, error } = await query;
  if (error || !data) return { count: 0, amount: 0 };
  return {
    count: data.length,
    amount: data.reduce((sum, row) => sum + toNumber(row.amount), 0),
  };
}

async function fetchInventoryCashTiedItems({
  supabase,
  tenantId,
  branchId,
  branches,
}: {
  supabase: SupabaseClient | null;
  tenantId: number;
  branchId: number | null;
  branches: BranchOption[];
}): Promise<FinanceInventoryItem[]> {
  if (!supabase) return [];
  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const stockBearingLocations = await fetchStockBearingLocationIds({
    supabase,
    tenantId,
    ...(branchId != null ? { branchId } : {}),
  });

  if (!stockBearingLocations.ok) {
    console.error("[finance:inventory-cash-tied] stock-bearing locations failed");
    return [];
  }

  if (stockBearingLocations.locationIds.length === 0) {
    return [];
  }

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
    .eq("tenant_id", tenantId)
    .in("location_id", stockBearingLocations.locationIds);

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

function getVNDateRangeUtc(startDate: string, endDate: string) {
  const { startIso } = getVNDayUtcRange(startDate);
  const { endIso } = getVNDayUtcRange(endDate);
  return { startIso, endIso };
}

async function fetchActualFoodCostSnapshot({
  supabase,
  tenantId,
  branchId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient | null;
  tenantId: number;
  branchId: number | null;
  startDate: string;
  endDate: string;
}): Promise<ActualFoodCostSnapshot> {
  if (!supabase) return { rows: [], orderCount: 0 };
  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  let query = supabase
    .from("stock_movements")
    .select("branch_id, order_id, quantity_change, unit_cost, created_at")
    .eq("tenant_id", tenantId)
    .eq("type", "consumption")
    .eq("movement_subtype", "sale_consumption")
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return { rows: [], orderCount: 0 };

  const rows = new Map<string, FoodCostRow>();
  const orderIds = new Set<number>();
  for (const row of data ?? []) {
    if (!row.created_at || row.branch_id == null) continue;
    if (row.order_id != null) orderIds.add(row.order_id);
    const period = getVNDateString(row.created_at);
    const key = `${period}:${row.branch_id}`;
    const current =
      rows.get(key) ??
      ({
        period_start: period,
        branch_id: row.branch_id,
        item_name: "Actual consumption",
        revenue: null,
        ingredient_cost: 0,
        food_cost_pct: null,
      } satisfies FoodCostRow);
    current.ingredient_cost =
      toNumber(current.ingredient_cost) +
      Math.abs(toNumber(row.quantity_change)) * toNumber(row.unit_cost);
    rows.set(key, current);
  }

  return { rows: Array.from(rows.values()), orderCount: orderIds.size };
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
  paymentDesync,
  cashVarianceHref,
  reconciliationAttention,
  reconciliationHref,
}: {
  kpis: FinanceCockpitKpis;
  dashboardSummary: Pick<
    FinanceDashboardSummary,
    "invoice_attention_count"
  > | null;
  cashVariance: CashVarianceSummary | null;
  foodCostRows: FoodCostRow[];
  unpaidSupplierInvoices: { count: number; amount: number };
  paymentDesync: { count: number; amount: number };
  cashVarianceHref?: string;
  reconciliationAttention: FinanceReconciliationAttention | null;
  reconciliationHref: string;
}): FinanceException[] {
  const missingCostCount = Math.max(
    0,
    kpis.orderCount - kpis.costCoverageOrderCount,
  );
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
      href: cashVarianceHref,
      tone:
        toNumber(cashVariance?.abs_variance_total) >= 500_000
          ? "destructive"
          : toNumber(cashVariance?.abs_variance_total) > 0
            ? "warning"
            : "neutral",
    },
    {
      label: copy.exceptions.bankReconciliationLabel,
      value: copy.exceptions.bankReconciliationValue(
        formatCount(
          toNumber(reconciliationAttention?.unmatched_bank_count) +
            toNumber(reconciliationAttention?.missing_vietqr_count),
        ),
      ),
      hint: copy.exceptions.bankReconciliationHint(
        formatCount(toNumber(reconciliationAttention?.unmatched_bank_count)),
        formatVND(toNumber(reconciliationAttention?.unmatched_bank_amount)),
        formatCount(toNumber(reconciliationAttention?.missing_vietqr_count)),
        formatVND(toNumber(reconciliationAttention?.missing_vietqr_amount)),
      ),
      href: reconciliationHref,
      tone:
        toNumber(reconciliationAttention?.unmatched_bank_count) > 0 ||
        toNumber(reconciliationAttention?.missing_vietqr_count) > 0
          ? "warning"
          : "neutral",
    },
    {
      label: copy.exceptions.operatingExpenseLabel,
      value: formatVND(kpis.operatingExpense),
      hint:
        kpis.operatingExpenseRecorded
          ? copy.exceptions.operatingExpenseRecorded
          : copy.exceptions.operatingExpenseMissing,
      href: "/finance/expenses",
      tone: kpis.operatingExpenseRecorded ? "neutral" : "warning",
    },
    {
      label: copy.exceptions.missingCostLabel,
      value: formatCount(missingCostCount),
      hint:
        missingCostCount > 0
          ? copy.exceptions.missingCostCoverageHint(
              formatCount(kpis.costCoverageOrderCount),
              formatCount(kpis.orderCount),
            )
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
      href: "/finance/supplier-invoices",
      tone: unpaidSupplierInvoices.count > 0 ? "warning" : "neutral",
    },
    {
      label: copy.exceptions.paymentDesyncLabel,
      value: formatCount(paymentDesync.count),
      hint:
        paymentDesync.count > 0
          ? copy.exceptions.paymentDesyncHint(formatCount(paymentDesync.count))
          : copy.exceptions.paymentDesyncClear,
      href: "/finance/revenue",
      tone: paymentDesync.count > 0 ? "warning" : "neutral",
    },
  ];
}

export async function fetchFinanceCockpit(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<FinanceCockpitData> {
  const { supabase, claims } = await loadAuthState();
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const canReadRequestedValuation =
    monetary.valuation &&
    monetary.client != null &&
    (params.branch == null
      ? monetary.systemValuation
      : await canAccessBranch(supabase, claims, params.branch));
  const monetaryClient = canReadRequestedValuation ? monetary.client : null;

  const [
    branchesRes,
    kpisRes,
    compareKpisRes,
    rollupRes,
    foodCostRes,
    actualFoodCost,
    compareActualFoodCost,
    inventoryValueRes,
    inventoryPeriodValueRes,
    cashVarianceRes,
    cashVarianceTarget,
    reconciliationAttention,
    dashboardSummaryRes,
    topItemsRes,
    operatingExpenseSummary,
    compareOperatingExpenseSummary,
    unpaidSupplierInvoices,
    paymentDesync,
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
    fetchActualFoodCostSnapshot({
      supabase: monetaryClient,
      tenantId: claims.tenant_id,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    resolved.compare
      ? fetchActualFoodCostSnapshot({
          supabase: monetaryClient,
          tenantId: claims.tenant_id,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
        })
      : Promise.resolve({ rows: [], orderCount: 0 }),
    canReadRequestedValuation
      ? fetchInventoryValueByBranch()
      : Promise.resolve({ success: false as const, error: "Không có quyền" }),
    canReadRequestedValuation
      ? fetchInventoryPeriodValue({
          startDate: resolved.start,
          endDate: resolved.end,
          ...(params.branch != null ? { branchId: params.branch } : {}),
        })
      : Promise.resolve({ success: false as const, error: "Không có quyền" }),
    fetchCashVarianceSummary(params.branch, resolved.start, resolved.end),
    fetchCashVarianceActionTarget({
      supabase,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    fetchFinanceReconciliationAttention({
      supabase,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    fetchFinanceDashboardSummary(params.branch, resolved.start, resolved.end),
    fetchTopItems(params.branch, resolved.start, resolved.end),
    fetchOperatingExpenseSummary({
      supabase,
      tenantId: claims.tenant_id,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    resolved.compare
      ? fetchOperatingExpenseSummary({
          supabase,
          tenantId: claims.tenant_id,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
        })
      : Promise.resolve({ total: 0, recorded: false }),
    fetchUnpaidSupplierInvoiceRisk({
      supabase,
      tenantId: claims.tenant_id,
      branchId: params.branch,
    }),
    fetchPaymentOrderDesync({
      supabase,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as BranchOption[];
  const foodCostRows = (
    foodCostRes.success ? (foodCostRes.data ?? []) : []
  ) as FoodCostRow[];
  const inventoryRows = inventoryValueRes.success
    ? (inventoryValueRes.data?.rows ?? [])
    : [];
  const currentInventoryValue =
    params.branch == null
      ? inventoryRows.reduce((sum, row) => sum + row.totalValue, 0)
      : (inventoryRows.find((row) => row.branchId === params.branch)
          ?.totalValue ?? 0);
  const inventoryValue = inventoryPeriodValueRes.success
    ? (inventoryPeriodValueRes.data?.closingValue ?? currentInventoryValue)
    : currentInventoryValue;
  const inventoryOpeningValue = inventoryPeriodValueRes.success
    ? (inventoryPeriodValueRes.data?.openingValue ?? inventoryValue)
    : inventoryValue;

  const kpis = buildKpis({
    kpis: kpisRes.success ? (kpisRes.data as KpiBundle | null) : null,
    actualFoodCost,
    inventoryValue,
    inventoryOpeningValue,
    operatingExpense: operatingExpenseSummary,
  });

  const compareKpis = resolved.compare
    ? buildKpis({
        kpis: compareKpisRes.success
          ? (compareKpisRes.data as KpiBundle | null)
          : null,
        actualFoodCost: compareActualFoodCost,
        inventoryValue,
        operatingExpense: compareOperatingExpenseSummary,
      })
    : null;

  const rollups = (
    rollupRes.success ? (rollupRes.data ?? []) : []
  ) as RollupRow[];
  const { revenueTrend, grossProfitTrend } = buildTrends(
    rollups,
    actualFoodCost.rows,
  );

  const branchCashVariance = new Map<number, number>();
  if (params.branch == null && branches.length > 0) {
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
  const cashVarianceBranchId =
    params.branch ??
    Array.from(branchCashVariance.entries()).sort(
      ([, amountA], [, amountB]) => amountB - amountA,
    )[0]?.[0];
  const cashVarianceHref =
    cashVarianceTarget != null
      ? `/br/${String(cashVarianceTarget.branch_id)}/pos-sessions?session=${String(cashVarianceTarget.session_id)}`
      : cashVarianceBranchId != null
        ? `/br/${String(cashVarianceBranchId)}/pos-sessions`
        : undefined;
  const reconciliationHref = `/finance/bank-transactions?range=custom&from=${resolved.start}&to=${resolved.end}`;
  const dashboardSummary = dashboardSummaryRes.success
    ? (dashboardSummaryRes.data as FinanceDashboardSummary | null)
    : null;

  return {
    branches,
    canViewInventoryValuation: canReadRequestedValuation,
    kpis,
    compareKpis: compareKpis
      ? {
          totalCollected: compareKpis.totalCollected,
          netRevenueBeforeVat: compareKpis.netRevenueBeforeVat,
          orderCount: compareKpis.orderCount,
          operatingExpense: compareKpis.operatingExpense,
          ingredientCost: compareKpis.ingredientCost,
          grossProfit: compareKpis.grossProfit,
          costAvailable: compareKpis.costAvailable,
        }
      : null,
    revenueTrend,
    grossProfitTrend,
    branchRows: buildBranchRows({
      branches,
      rollups,
      foodCostRows: actualFoodCost.rows,
      inventoryRows,
      cashVarianceByBranch: branchCashVariance,
    }),
    inventoryItems: await fetchInventoryCashTiedItems({
      supabase: monetaryClient,
      tenantId: claims.tenant_id,
      branchId: params.branch,
      branches,
    }),
    topItems: (topItemsRes.success
      ? (topItemsRes.data ?? [])
      : []) as TopItemRow[],
    dashboardSummary,
    exceptions: buildExceptions({
      kpis,
      dashboardSummary,
      cashVariance: cashVarianceRes.success
        ? (cashVarianceRes.data as CashVarianceSummary | null)
        : null,
      foodCostRows,
      unpaidSupplierInvoices,
      paymentDesync,
      cashVarianceHref,
      reconciliationAttention,
      reconciliationHref,
    }),
  };
}
