import {
  formatAccountingVND as formatVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import { addMoney } from "@comtammatu/shared/money";
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
  type FinanceDashboardSummary,
} from "../actions";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import type {
  FinanceLocation,
  FinanceParams,
  ResolvedFinanceRange,
} from "./finance-params";
import { financeHref } from "./finance-params";
import {
  CONFIRMED_SUPPLIER_INVOICE_STATUSES,
  periodGoodsInEventTypes,
  periodGoodsInKindForLocation,
  sumConfirmedSupplierInvoiceSubtotals,
  sumPeriodGoodsIn,
  type PeriodGoodsInAllocation,
  type PeriodGoodsInKind,
} from "./finance-goods-in";
import { calculateFinanceResult } from "./finance-result";
import {
  isExpenseLedgerCategory,
  isOperatingExpenseCategory,
  isStartupCapitalCategory,
} from "./expense-categories";
import { addPaidOrdersWithoutRecipeNeed } from "./food-cost-coverage";
import { fetchAllPagedRows } from "./supabase-page";
import {
  applySalesBranchesFilter,
  fetchSalesBranchIds,
} from "./finance-sales-branches";
import {
  fetchCashSummary,
  type CashSummary,
} from "./cash-cockpit";

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

interface StartupCapitalSummary {
  total: number;
  recorded: boolean;
  equipment: number;
  equipmentRecorded: boolean;
}

interface FinanceVatSummary {
  inputRecorded: string | null;
  outputIssued: string | null;
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

interface PeriodExpenseRow {
  subtotal: number | string | null;
  vat_amount: number | string | null;
  category: string | null;
}

interface FinanceCockpitOptions {
  /** Hub page only — loads tenant-wide current funds once via cash-cockpit. */
  includeCash?: boolean;
}

interface FinanceCockpitKpis {
  totalCollected: number;
  orderCount: number;
  netRevenueBeforeVat: number;
  inventoryValue: number;
  inventoryOpeningValue: number;
  inventoryChange: number;
  operatingExpense: number;
  operatingExpenseRecorded: boolean;
  startupCapital: number;
  startupCapitalRecorded: boolean;
  equipment: number;
  equipmentRecorded: boolean;
  goodsIn: number;
  goodsInKind: PeriodGoodsInKind;
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
  vat: FinanceVatSummary;
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
  exceptions: FinanceException[];
  dashboardSummary: FinanceDashboardSummary | null;
  cash?: CashSummary;
}

interface BranchOption {
  id: number;
  name: string;
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

function isFoodCostRepriceEvent(
  eventType: string | null | undefined,
): boolean {
  return (
    eventType === "invoice_reprice" ||
    eventType === "credit_reprice" ||
    eventType === "provisional_reprice"
  );
}

async function isInventoryValuationActive(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("inventory_valuation_cutovers")
    .select("status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[finance:valuation-mode] cutover lookup failed", error.code);
    return false;
  }
  return data?.status === "active";
}

function buildKpis({
  kpis,
  actualFoodCost,
  goodsIn,
  goodsInKind,
  inventoryValue,
  inventoryOpeningValue = inventoryValue,
  operatingExpense,
  startupCapital,
  includeInventoryChange = true,
}: {
  kpis: KpiBundle | null;
  actualFoodCost: ActualFoodCostSnapshot;
  goodsIn: number;
  goodsInKind: PeriodGoodsInKind;
  inventoryValue: number;
  inventoryOpeningValue?: number;
  operatingExpense: OperatingExpenseSummary;
  startupCapital: StartupCapitalSummary;
  includeInventoryChange?: boolean;
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
  const inventoryChange = includeInventoryChange
    ? inventoryValue - inventoryOpeningValue
    : 0;
  const financeResult = calculateFinanceResult({
    netRevenueBeforeVat,
    goodsIn,
    ingredientCost,
    operatingExpense: operatingExpense.total,
    inventoryChange,
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
    startupCapital: startupCapital.total,
    startupCapitalRecorded: startupCapital.recorded,
    equipment: startupCapital.equipment,
    equipmentRecorded: startupCapital.equipmentRecorded,
    goodsIn,
    goodsInKind,
    ingredientCost,
    ...financeResult,
    costAvailable,
    costCoverageOrderCount,
    costCoverageRatio,
    cashRevenue: toNumber(kpis?.cash_revenue),
    vietqrRevenue: toNumber(kpis?.vietqr_revenue),
  };
}

function summarizeStartupCapital(
  rows: Array<{ amount: number | string | null; category: string | null }>,
): StartupCapitalSummary {
  const capitalRows = rows.filter(
    (row): row is { amount: number | string | null; category: string } =>
      row.category != null && isStartupCapitalCategory(row.category),
  );
  // Equipment is the capital slice of startup outlay, shown separately on
  // Tài sản. Do not add it to cash + inventory as a fake asset total.
  const equipmentRows = capitalRows.filter((row) => row.category === "capital");

  return {
    total: toNumber(addMoney(capitalRows.map((row) => String(row.amount)))),
    recorded: capitalRows.length > 0,
    equipment: toNumber(
      addMoney(equipmentRows.map((row) => String(row.amount))),
    ),
    equipmentRecorded: equipmentRows.length > 0,
  };
}

async function fetchStartupCapitalSummary({
  supabase,
  tenantId,
  location,
  branchId,
  salesBranchIds,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  location: FinanceLocation;
  branchId: number | null;
  salesBranchIds?: number[] | null;
}): Promise<StartupCapitalSummary> {
  let query = supabase
    .from("expenses")
    .select("amount, category")
    .eq("tenant_id", tenantId)
    .in("category", ["capital", "deposit"]);

  if (location === "company") {
    query = query.is("branch_id", null);
  } else if (location === "branches") {
    const branchIds =
      salesBranchIds ?? (await fetchSalesBranchIds(supabase as never, tenantId));
    query = applySalesBranchesFilter(query, "branch_id", branchIds);
  } else if (location === "branch" && branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) {
    return {
      total: 0,
      recorded: false,
      equipment: 0,
      equipmentRecorded: false,
    };
  }
  return summarizeStartupCapital(
    (data ?? []) as Array<{
      amount: number | string | null;
      category: string | null;
    }>,
  );
}

function summarizeOperatingExpenses(
  rows: PeriodExpenseRow[],
): OperatingExpenseSummary {
  const operatingRows = rows.filter(
    (row): row is PeriodExpenseRow & { category: string } =>
      row.category != null && isOperatingExpenseCategory(row.category),
  );

  return {
    total: toNumber(addMoney(operatingRows.map((row) => String(row.subtotal)))),
    recorded: operatingRows.length > 0,
  };
}

async function fetchPeriodExpenseRows({
  supabase,
  tenantId,
  location,
  branchId,
  startDate,
  endDate,
  salesBranchIds,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  location: FinanceLocation;
  branchId: number | null;
  startDate: string;
  endDate: string;
  salesBranchIds?: number[] | null;
}): Promise<PeriodExpenseRow[]> {
  let query = supabase
    .from("expenses")
    .select("subtotal, vat_amount, category")
    .eq("tenant_id", tenantId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (location === "company") {
    query = query.is("branch_id", null);
  } else if (location === "branches") {
    const branchIds =
      salesBranchIds ?? (await fetchSalesBranchIds(supabase as never, tenantId));
    query = applySalesBranchesFilter(query, "branch_id", branchIds);
  } else if (location === "branch" && branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as PeriodExpenseRow[];
}

export async function fetchOperatingExpenseSummary({
  supabase,
  tenantId,
  location,
  branchId,
  startDate,
  endDate,
  salesBranchIds,
  expenseRows,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  location: FinanceLocation;
  branchId: number | null;
  startDate: string;
  endDate: string;
  salesBranchIds?: number[] | null;
  expenseRows?: PeriodExpenseRow[];
}): Promise<OperatingExpenseSummary> {
  if (expenseRows) {
    return summarizeOperatingExpenses(expenseRows);
  }

  const rows = await fetchPeriodExpenseRows({
    supabase,
    tenantId,
    location,
    branchId,
    startDate,
    endDate,
    salesBranchIds,
  });
  return summarizeOperatingExpenses(rows);
}

async function fetchFinanceVatSummary({
  supabase,
  tenantId,
  location,
  branchId,
  startDate,
  endDate,
  salesBranchIds,
  periodExpenseRows,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  location: FinanceLocation;
  branchId: number | null;
  startDate: string;
  endDate: string;
  salesBranchIds?: number[] | null;
  periodExpenseRows?: PeriodExpenseRow[];
}): Promise<FinanceVatSummary> {
  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  const supplierInvoiceSelect =
    location === "branches" || location === "branch"
      ? "vat_amount, goods_received_notes!inner ( branch_id )"
      : "vat_amount";

  let supplierInvoiceQuery = supabase
    .from("supplier_invoices")
    .select(supplierInvoiceSelect)
    .eq("tenant_id", tenantId)
    .in("document_status", ["confirmed", "adjusted"])
    .gte("invoice_date", startIso)
    .lt("invoice_date", endIso);
  if (location === "company") {
    supplierInvoiceQuery = supplierInvoiceQuery.is("grn_id", null);
  } else if (location === "branches") {
    const branchIds =
      salesBranchIds ?? (await fetchSalesBranchIds(supabase as never, tenantId));
    supplierInvoiceQuery = applySalesBranchesFilter(
      supplierInvoiceQuery,
      "goods_received_notes.branch_id",
      branchIds,
    );
  } else if (location === "branch" && branchId != null) {
    supplierInvoiceQuery = supplierInvoiceQuery.eq(
      "goods_received_notes.branch_id",
      branchId,
    );
  }

  let outputInvoiceQuery = supabase
    .from("tax_invoices")
    .select("vat_amount")
    .eq("tenant_id", tenantId)
    .eq("status", "issued")
    .gte("issued_at", startIso)
    .lt("issued_at", endIso);
  if (location === "company") {
    outputInvoiceQuery = outputInvoiceQuery.is("branch_id", null);
  } else if (location === "branches") {
    const branchIds =
      salesBranchIds ?? (await fetchSalesBranchIds(supabase as never, tenantId));
    outputInvoiceQuery = applySalesBranchesFilter(
      outputInvoiceQuery,
      "branch_id",
      branchIds,
    );
  } else if (location === "branch" && branchId != null) {
    outputInvoiceQuery = outputInvoiceQuery.eq("branch_id", branchId);
  }

  const expensePromise: Promise<{ data: PeriodExpenseRow[]; error: null }> =
    periodExpenseRows != null
      ? Promise.resolve({ data: periodExpenseRows, error: null })
      : fetchPeriodExpenseRows({
          supabase,
          tenantId,
          location,
          branchId,
          startDate,
          endDate,
          salesBranchIds,
        }).then((rows) => ({ data: rows, error: null }));

  const [supplierInvoices, expenses, outputInvoices] = await Promise.all([
    supplierInvoiceQuery,
    expensePromise,
    outputInvoiceQuery,
  ]);

  if (supplierInvoices.error) {
    console.error("[finance:vat-input] summary query failed", {
      supplierCode: supplierInvoices.error.code,
    });
  }
  if (outputInvoices.error) {
    console.error("[finance:vat-output] summary query failed", {
      code: outputInvoices.error.code,
    });
  }

  const sumVat = (rows: unknown[] | null): string =>
    addMoney(
      (rows ?? []).map((row) => {
        const value =
          typeof row === "object" && row !== null && "vat_amount" in row
            ? row.vat_amount
            : null;
        return String(value ?? "0");
      }),
    );

  const expenseRows = (expenses.data ?? []) as PeriodExpenseRow[];

  return {
    inputRecorded: supplierInvoices.error
      ? null
      : addMoney([
          sumVat(supplierInvoices.data as unknown[] | null),
          sumVat(
            expenseRows.filter(
              (row): row is PeriodExpenseRow & { category: string } =>
                row.category != null &&
                isExpenseLedgerCategory(row.category),
            ),
          ),
        ]),
    outputIssued: outputInvoices.error
      ? null
      : sumVat(outputInvoices.data as unknown[] | null),
  };
}

async function fetchUnpaidSupplierInvoiceRisk({
  supabase,
  tenantId,
  location,
  branchId,
  startDate,
  endDate,
  salesBranchIds,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  location: FinanceLocation;
  branchId: number | null;
  startDate: string;
  endDate: string;
  salesBranchIds?: number[] | null;
}): Promise<{ count: number; amount: number }> {
  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  const select =
    location === "branches" || location === "branch"
      ? "total_amount, paid_amount, credit_applied_amount, payment_status, goods_received_notes!inner(branch_id)"
      : "total_amount, paid_amount, credit_applied_amount, payment_status";

  let query = supabase
    .from("supplier_invoices")
    .select(select)
    .eq("tenant_id", tenantId)
    .neq("payment_status", "paid")
    .gte("invoice_date", startIso)
    .lt("invoice_date", endIso);

  if (location === "company") {
    query = query.is("grn_id", null);
  } else if (location === "branches") {
    const branchIds =
      salesBranchIds ?? (await fetchSalesBranchIds(supabase as never, tenantId));
    query = applySalesBranchesFilter(
      query,
      "goods_received_notes.branch_id",
      branchIds,
    );
  } else if (location === "branch" && branchId != null) {
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

function getVNDateRangeUtc(startDate: string, endDate: string) {
  const { startIso } = getVNDayUtcRange(startDate);
  const { endIso } = getVNDayUtcRange(endDate);
  return { startIso, endIso };
}

type GoodsInEventEmbed = {
  event_type?: string | null;
  stock_movements?:
    | { branch_id?: number | null; grn_id?: number | null }
    | Array<{ branch_id?: number | null; grn_id?: number | null }>
    | null;
};

function asPeriodGoodsInAllocation(row: {
  allocated_value?: number | string | null;
  allocation_bucket?: string | null;
  inventory_valuation_events?: GoodsInEventEmbed | GoodsInEventEmbed[] | null;
}): PeriodGoodsInAllocation {
  const event = Array.isArray(row.inventory_valuation_events)
    ? row.inventory_valuation_events[0]
    : row.inventory_valuation_events;
  const movement = Array.isArray(event?.stock_movements)
    ? event.stock_movements[0]
    : event?.stock_movements;
  return {
    allocatedValue: toNumber(row.allocated_value),
    allocationBucket: row.allocation_bucket ?? null,
    eventType: event?.event_type ?? null,
    branchId: movement?.branch_id ?? null,
    grnId: movement?.grn_id ?? null,
  };
}

async function fetchPeriodInvoiceGoodsIn({
  supabase,
  tenantId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  tenantId: number;
  startDate: string;
  endDate: string;
}): Promise<number> {
  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  const { data, error } = await fetchAllPagedRows((from, to) =>
    supabase
      .from("supplier_invoices")
      .select("subtotal, document_status")
      .eq("tenant_id", tenantId)
      .in("document_status", [...CONFIRMED_SUPPLIER_INVOICE_STATUSES])
      .gte("invoice_date", startIso)
      .lt("invoice_date", endIso)
      .order("id")
      .range(from, to),
  );
  if (error) {
    console.error("[finance:goods-in] invoice lookup failed", error.code);
    return 0;
  }

  return sumConfirmedSupplierInvoiceSubtotals(
    (data ?? []).map((row) => ({
      documentStatus: String(
        (row as { document_status?: string | null }).document_status ?? "",
      ),
      subtotal: toNumber((row as { subtotal?: number | string | null }).subtotal),
    })),
  );
}

async function fetchPeriodGoodsIn({
  supabase,
  allocationClient,
  tenantId,
  location,
  branchId,
  startDate,
  endDate,
  valuationActive,
  salesBranchIds,
}: {
  supabase: SupabaseClient;
  allocationClient: SupabaseClient | null;
  tenantId: number;
  location: FinanceLocation;
  branchId: number | null;
  startDate: string;
  endDate: string;
  valuationActive: boolean;
  salesBranchIds: readonly number[] | null;
}): Promise<number> {
  const kind = periodGoodsInKindForLocation(location);
  if (kind === "inventory_purchase") {
    return fetchPeriodInvoiceGoodsIn({
      supabase,
      tenantId,
      startDate,
      endDate,
    });
  }

  if (!allocationClient || !valuationActive) return 0;
  const allowedBranchIds = new Set(
    location === "branch" && branchId != null
      ? [branchId]
      : [...(salesBranchIds ?? [])],
  );
  if (allowedBranchIds.size === 0) return 0;

  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  const { data, error } = await fetchAllPagedRows((from, to) =>
    allocationClient
      .from("inventory_value_allocations")
      .select(
        `
        allocated_value,
        allocation_bucket,
        inventory_valuation_events!inner (
          event_type,
          effective_at,
          stock_movements ( branch_id, grn_id )
        )
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("allocation_bucket", "inventory")
      .in("inventory_valuation_events.event_type", [
        ...periodGoodsInEventTypes(kind),
      ])
      .gte("inventory_valuation_events.effective_at", startIso)
      .lt("inventory_valuation_events.effective_at", endIso)
      .order("id")
      .range(from, to),
  );
  if (error) {
    console.error("[finance:goods-in] allocation lookup failed", error.code);
    return 0;
  }

  return sumPeriodGoodsIn(
    (data ?? []).map(asPeriodGoodsInAllocation),
    kind,
    allowedBranchIds,
  );
}

async function fetchActualFoodCostSnapshot({
  supabase,
  tenantId,
  branchId,
  startDate,
  endDate,
  valuationActive,
  salesBranchIds,
}: {
  supabase: SupabaseClient | null;
  tenantId: number;
  branchId: number | null;
  startDate: string;
  endDate: string;
  valuationActive?: boolean;
  /** Chi nhánh bán only — never Kho Tổng / Bếp Trung Tâm. */
  salesBranchIds: readonly number[];
}): Promise<ActualFoodCostSnapshot> {
  if (!supabase) return { rows: [], orderCount: 0 };
  const { startIso, endIso } = getVNDateRangeUtc(startDate, endDate);
  const cutoverActive =
    valuationActive ??
    (await isInventoryValuationActive(supabase, tenantId));
  if (!cutoverActive) {
    console.error(
      "[finance:food-cost] inventory valuation cutover is not active",
    );
    return { rows: [], orderCount: 0 };
  }

  // Giá vốn món = POS sale_consumption at sales Chi nhánh only.
  const allowedBranchIds =
    branchId != null
      ? salesBranchIds.includes(branchId)
        ? [branchId]
        : []
      : [...salesBranchIds];
  if (allowedBranchIds.length === 0) return { rows: [], orderCount: 0 };
  const allowedBranchSet = new Set(allowedBranchIds);

  const { data, error } = await fetchAllPagedRows((from, to) =>
    supabase
      .from("inventory_value_allocations")
      .select(
        `
        source_origin_id,
        allocated_value,
        inventory_valuation_events!inner (
          event_type,
          effective_at,
          terminal_bucket,
          stock_movements ( branch_id, order_id )
        )
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("allocation_bucket", "food_cost")
      .gte("inventory_valuation_events.effective_at", startIso)
      .lt("inventory_valuation_events.effective_at", endIso)
      .order("id")
      .range(from, to),
  );
  if (error) return { rows: [], orderCount: 0 };

  const repriceRows = (data ?? []).filter((row) => {
    const event = Array.isArray(row.inventory_valuation_events)
      ? row.inventory_valuation_events[0]
      : row.inventory_valuation_events;
    return isFoodCostRepriceEvent(event?.event_type);
  });
  const branchWeights = new Map<
    number,
    { total: number; byBranch: Map<number, number> }
  >();
  if (repriceRows.length > 0) {
    const originIds = [
      ...new Set(
        repriceRows
          .map((row) => row.source_origin_id)
          .filter((id): id is number => id != null),
      ),
    ];
    const { data: lineage, error: lineageError } = await fetchAllPagedRows(
      (from, to) =>
        supabase
          .from("inventory_value_allocations")
          .select(
            `
          source_origin_id,
          allocated_quantity,
          inventory_valuation_events!inner (
            terminal_bucket,
            stock_movements!inner ( branch_id, order_id )
          )
        `,
          )
          .eq("tenant_id", tenantId)
          .in("source_origin_id", originIds)
          .eq("inventory_valuation_events.terminal_bucket", "food_cost")
          .order("id")
          .range(from, to),
    );
    if (lineageError) return { rows: [], orderCount: 0 };
    for (const allocation of lineage ?? []) {
      if (allocation.source_origin_id == null) continue;
      const event = Array.isArray(allocation.inventory_valuation_events)
        ? allocation.inventory_valuation_events[0]
        : allocation.inventory_valuation_events;
      const movement = Array.isArray(event?.stock_movements)
        ? event.stock_movements[0]
        : event?.stock_movements;
      if (movement?.branch_id == null) continue;
      const weight = branchWeights.get(allocation.source_origin_id) ?? {
        total: 0,
        byBranch: new Map<number, number>(),
      };
      const quantity = toNumber(allocation.allocated_quantity);
      weight.total += quantity;
      if (
        movement.order_id != null &&
        allowedBranchSet.has(movement.branch_id)
      ) {
        weight.byBranch.set(
          movement.branch_id,
          (weight.byBranch.get(movement.branch_id) ?? 0) + quantity,
        );
      }
      branchWeights.set(allocation.source_origin_id, weight);
    }
  }

  const rows = new Map<string, FoodCostRow>();
  const orderIds = new Set<number>();
  const addCost = (period: string, rowBranchId: number, value: number) => {
    if (!allowedBranchSet.has(rowBranchId)) return;
    const key = `${period}:${rowBranchId}`;
    const current =
      rows.get(key) ??
      ({
        period_start: period,
        branch_id: rowBranchId,
        item_name: "Actual consumption",
        revenue: null,
        ingredient_cost: 0,
        food_cost_pct: null,
      } satisfies FoodCostRow);
    current.ingredient_cost = toNumber(current.ingredient_cost) + value;
    rows.set(key, current);
  };
  for (const allocation of data ?? []) {
    const event = Array.isArray(allocation.inventory_valuation_events)
      ? allocation.inventory_valuation_events[0]
      : allocation.inventory_valuation_events;
    if (!event?.effective_at) continue;
    const period = getVNDateString(event.effective_at);
    const movement = Array.isArray(event.stock_movements)
      ? event.stock_movements[0]
      : event.stock_movements;
    if (!isFoodCostRepriceEvent(event.event_type)) {
      // POS-only at sales Chi nhánh — skip manual slips and Kho Tổng / Bếp TT.
      if (movement?.branch_id == null || movement.order_id == null) continue;
      if (!allowedBranchSet.has(movement.branch_id)) continue;
      orderIds.add(movement.order_id);
      addCost(
        period,
        movement.branch_id,
        toNumber(allocation.allocated_value),
      );
      continue;
    }
    if (allocation.source_origin_id == null) continue;
    const weight = branchWeights.get(allocation.source_origin_id);
    if (!weight || weight.total <= 0) continue;
    for (const [rowBranchId, quantity] of weight.byBranch) {
      addCost(
        period,
        rowBranchId,
        (toNumber(allocation.allocated_value) * quantity) / weight.total,
      );
    }
  }
  await addPaidOrdersWithoutRecipeNeed({
    supabase,
    tenantId,
    allowedBranchIds,
    startIso,
    endIso,
    coveredOrderIds: orderIds,
  });
  return { rows: Array.from(rows.values()), orderCount: orderIds.size };
}

function buildExceptions({
  params,
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
  params: FinanceParams;
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
  const invoiceAttentionCount = dashboardSummary?.invoice_attention_count ?? 0;

  return [
    {
      label: copy.exceptions.cashVarianceLabel,
      value: formatVND(toNumber(cashVariance?.abs_variance_total)),
      hint:
        toNumber(cashVariance?.session_count) > 0
          ? copy.exceptions.cashVarianceClosedSessions(
              formatCount(toNumber(cashVariance?.session_count)),
            )
          : "",
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
      hint: kpis.operatingExpenseRecorded
        ? ""
        : copy.exceptions.operatingExpenseMissing,
      href: financeHref("/finance/expenses", params, {
        state: kpis.operatingExpenseRecorded ? null : "pending",
      }),
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
            : "",
      href: financeHref("/finance/food-cost", params),
      tone: missingCostCount > 0 || highFoodCost ? "warning" : "neutral",
    },
    {
      label: copy.exceptions.invoiceAttentionLabel,
      value: formatCount(invoiceAttentionCount),
      hint: "",
      href: financeHref("/finance/invoices", params, {
        queue: invoiceAttentionCount > 0 ? "attention" : null,
      }),
      tone: invoiceAttentionCount > 0 ? "warning" : "neutral",
    },
    {
      label: copy.exceptions.supplierInvoiceLabel,
      value: formatVND(unpaidSupplierInvoices.amount),
      hint: copy.exceptions.supplierInvoiceHint(
        formatCount(unpaidSupplierInvoices.count),
      ),
      href: financeHref("/finance/supplier-invoices", params),
      tone: unpaidSupplierInvoices.count > 0 ? "warning" : "neutral",
    },
    {
      label: copy.exceptions.paymentDesyncLabel,
      value: formatCount(paymentDesync.count),
      hint: "",
      // Point at the bank-transactions reconciliation screen instead of the
      // revenue chart (which had no desync-fix affordance). The dedicated
      // desync resolution screen is a follow-up; this stops the dead-end link.
      href: financeHref("/finance/bank-transactions", params, {
        recon: "needs_review",
      }),
      tone: paymentDesync.count > 0 ? "warning" : "neutral",
    },
  ];
}

/** Home `/` attention only — exception counts/hrefs, not the full cockpit. */
export async function fetchFinanceAttentionExceptions(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<FinanceException[]> {
  const { supabase, claims } = await loadAuthState();
  const includesBranchData = params.location !== "company";
  const includesCompanyData =
    params.location === "all" || params.location === "company";
  const salesBranchIds = includesBranchData
    ? await fetchSalesBranchIds(supabase as never, claims.tenant_id)
    : null;

  const [
    cashVarianceRes,
    cashVarianceTarget,
    reconciliationAttention,
    dashboardSummaryRes,
    unpaidSupplierInvoices,
    paymentDesync,
  ] = await Promise.all([
    includesBranchData
      ? fetchCashVarianceSummary(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: null }),
    includesBranchData
      ? fetchCashVarianceActionTarget({
          supabase,
          branchId: params.branch,
          startDate: resolved.start,
          endDate: resolved.end,
        })
      : Promise.resolve(null),
    includesCompanyData
      ? fetchFinanceReconciliationAttention({
          supabase,
          startDate: resolved.start,
          endDate: resolved.end,
        })
      : Promise.resolve(null),
    includesBranchData
      ? fetchFinanceDashboardSummary(
          params.branch,
          resolved.start,
          resolved.end,
        )
      : Promise.resolve({ success: true as const, data: null }),
    fetchUnpaidSupplierInvoiceRisk({
      supabase,
      tenantId: claims.tenant_id,
      location: params.location,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
      salesBranchIds,
    }),
    includesBranchData
      ? fetchPaymentOrderDesync({
          supabase,
          branchId: params.branch,
          startDate: resolved.start,
          endDate: resolved.end,
        })
      : Promise.resolve({ count: 0, amount: 0 }),
  ]);

  const cashVarianceHref =
    cashVarianceTarget != null
      ? `/br/${String(cashVarianceTarget.branch_id)}/pos-sessions?session=${String(cashVarianceTarget.session_id)}`
      : params.branch != null
        ? `/br/${String(params.branch)}/pos-sessions`
        : undefined;
  const reconciliationHref = financeHref(
    "/finance/bank-transactions",
    {
      ...params,
      range: "custom",
      period: null,
      from: resolved.start,
      to: resolved.end,
    },
    { recon: "needs_review" },
  );
  const dashboardSummary = dashboardSummaryRes.success
    ? (dashboardSummaryRes.data as FinanceDashboardSummary | null)
    : null;

  return buildExceptions({
    params,
    kpis: {
      totalCollected: 0,
      orderCount: 0,
      netRevenueBeforeVat: 0,
      inventoryValue: 0,
      inventoryOpeningValue: 0,
      inventoryChange: 0,
      operatingExpense: 0,
      operatingExpenseRecorded: true,
      startupCapital: 0,
      startupCapitalRecorded: false,
      equipment: 0,
      equipmentRecorded: false,
      goodsIn: 0,
      goodsInKind: periodGoodsInKindForLocation(params.location),
      ingredientCost: 0,
      grossProfit: null,
      grossMargin: null,
      operatingResult: null,
      costAvailable: true,
      costCoverageOrderCount: 0,
      costCoverageRatio: 1,
      cashRevenue: 0,
      vietqrRevenue: 0,
    },
    dashboardSummary,
    cashVariance: cashVarianceRes.success
      ? (cashVarianceRes.data as CashVarianceSummary | null)
      : null,
    foodCostRows: [],
    unpaidSupplierInvoices,
    paymentDesync,
    cashVarianceHref,
    reconciliationHref,
    reconciliationAttention,
  }).filter((item) => item.tone !== "neutral");
}

export async function fetchFinanceCockpit(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
  options?: FinanceCockpitOptions,
): Promise<FinanceCockpitData> {
  const { supabase, claims } = await loadAuthState();
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const includesBranchData = params.location !== "company";
  const includesCompanyData =
    params.location === "all" || params.location === "company";
  const canReadRequestedValuation =
    monetary.client != null &&
    (params.branch == null ||
      (await canAccessBranch(supabase, claims, params.branch)));
  const monetaryClient = canReadRequestedValuation ? monetary.client : null;

  const [salesBranchIds, valuationActive] = await Promise.all([
    includesBranchData
      ? fetchSalesBranchIds(supabase as never, claims.tenant_id)
      : Promise.resolve(null),
    includesBranchData && monetaryClient
      ? isInventoryValuationActive(monetaryClient, claims.tenant_id)
      : Promise.resolve(false),
  ]);

  // Hub loader keys (distinct fetches, max 21 when compare + cash):
  // prefetch: salesBranchIds, valuationActive (2, before parallel batch)
  // parallel (max 20): branches, revenueKpis, compareRevenueKpis, foodCost,
  // actualFoodCost, compareActualFoodCost, goodsIn, compareGoodsIn,
  // inventoryByBranch, inventoryPeriod, cashVariance, cashVarianceTarget,
  // reconciliation, dashboardSummary, periodExpenses, comparePeriodExpenses,
  // startupCapital, unpaidAp, paymentDesync, currentFunds.
  // sequential (1): vatSummary (reuses periodExpenses rows).
  const [
    branchesRes,
    kpisRes,
    compareKpisRes,
    foodCostRes,
    actualFoodCost,
    compareActualFoodCost,
    periodGoodsIn,
    comparePeriodGoodsIn,
    inventoryValueRes,
    inventoryPeriodValueRes,
    cashVarianceRes,
    cashVarianceTarget,
    reconciliationAttention,
    dashboardSummaryRes,
    periodExpenseRows,
    comparePeriodExpenseRows,
    startupCapitalSummary,
    unpaidSupplierInvoices,
    paymentDesync,
    cash,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    includesBranchData
      ? fetchRevenueKpis(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: null }),
    includesBranchData && resolved.compare
      ? fetchRevenueKpis(
          params.branch,
          resolved.compare.start,
          resolved.compare.end,
        )
      : Promise.resolve({ success: true as const, data: null }),
    includesBranchData
      ? fetchFoodCost({
          startDate: resolved.start,
          endDate: resolved.end,
          ...(params.branch != null ? { branchId: params.branch } : {}),
        })
      : Promise.resolve({ success: true as const, data: [] }),
    includesBranchData
      ? fetchActualFoodCostSnapshot({
          supabase: monetaryClient,
          tenantId: claims.tenant_id,
          branchId: params.branch,
          startDate: resolved.start,
          endDate: resolved.end,
          valuationActive,
          salesBranchIds: salesBranchIds ?? [],
        })
      : Promise.resolve({ rows: [], orderCount: 0 }),
    includesBranchData && resolved.compare
      ? fetchActualFoodCostSnapshot({
          supabase: monetaryClient,
          tenantId: claims.tenant_id,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
          valuationActive,
          salesBranchIds: salesBranchIds ?? [],
        })
      : Promise.resolve({ rows: [], orderCount: 0 }),
    fetchPeriodGoodsIn({
      supabase,
      allocationClient: monetaryClient,
      tenantId: claims.tenant_id,
      location: params.location,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
      valuationActive,
      salesBranchIds,
    }),
    resolved.compare
      ? fetchPeriodGoodsIn({
          supabase,
          allocationClient: monetaryClient,
          tenantId: claims.tenant_id,
          location: params.location,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
          valuationActive,
          salesBranchIds,
        })
      : Promise.resolve(0),
    canReadRequestedValuation && includesBranchData
      ? fetchInventoryValueByBranch()
      : Promise.resolve({ success: false as const, error: "Không có quyền" }),
    canReadRequestedValuation && includesBranchData
      ? fetchInventoryPeriodValue({
          startDate: resolved.start,
          endDate: resolved.end,
          ...(params.branch != null
            ? { branchId: params.branch }
            : params.location === "branches" && salesBranchIds
              ? { branchIds: [...salesBranchIds] }
              : {}),
        })
      : Promise.resolve({ success: false as const, error: "Không có quyền" }),
    includesBranchData
      ? fetchCashVarianceSummary(params.branch, resolved.start, resolved.end)
      : Promise.resolve({ success: true as const, data: null }),
    includesBranchData
      ? fetchCashVarianceActionTarget({
          supabase,
          branchId: params.branch,
          startDate: resolved.start,
          endDate: resolved.end,
        })
      : Promise.resolve(null),
    includesCompanyData
      ? fetchFinanceReconciliationAttention({
          supabase,
          startDate: resolved.start,
          endDate: resolved.end,
        })
      : Promise.resolve(null),
    includesBranchData
      ? fetchFinanceDashboardSummary(
          params.branch,
          resolved.start,
          resolved.end,
        )
      : Promise.resolve({ success: true as const, data: null }),
    fetchPeriodExpenseRows({
      supabase,
      tenantId: claims.tenant_id,
      location: params.location,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
      salesBranchIds,
    }),
    resolved.compare
      ? fetchPeriodExpenseRows({
          supabase,
          tenantId: claims.tenant_id,
          location: params.location,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
          salesBranchIds,
        })
      : Promise.resolve([]),
    fetchStartupCapitalSummary({
      supabase,
      tenantId: claims.tenant_id,
      location: params.location,
      branchId: params.branch,
      salesBranchIds,
    }),
    fetchUnpaidSupplierInvoiceRisk({
      supabase,
      tenantId: claims.tenant_id,
      location: params.location,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
      salesBranchIds,
    }),
    includesBranchData
      ? fetchPaymentOrderDesync({
          supabase,
          branchId: params.branch,
          startDate: resolved.start,
          endDate: resolved.end,
        })
      : Promise.resolve({ count: 0, amount: 0 }),
    options?.includeCash
      ? fetchCashSummary(supabase)
      : Promise.resolve(undefined),
  ]);

  const operatingExpenseSummary = summarizeOperatingExpenses(periodExpenseRows);
  const compareOperatingExpenseSummary = resolved.compare
    ? summarizeOperatingExpenses(comparePeriodExpenseRows)
    : { total: 0, recorded: false };

  const vat = await fetchFinanceVatSummary({
    supabase,
    tenantId: claims.tenant_id,
    location: params.location,
    branchId: params.branch,
    startDate: resolved.start,
    endDate: resolved.end,
    salesBranchIds,
    periodExpenseRows,
  });

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as BranchOption[];
  const foodCostRows = (
    foodCostRes.success ? (foodCostRes.data ?? []) : []
  ) as FoodCostRow[];
  const inventoryRows = inventoryValueRes.success
    ? (inventoryValueRes.data?.rows ?? [])
    : [];
  const salesInventoryRows =
    params.location === "branches" && salesBranchIds
      ? inventoryRows.filter((row) => salesBranchIds.includes(row.branchId))
      : inventoryRows;
  const currentInventoryValue =
    params.branch == null
      ? salesInventoryRows.reduce((sum, row) => sum + row.totalValue, 0)
      : (inventoryRows.find((row) => row.branchId === params.branch)
          ?.totalValue ?? 0);
  const inventoryValue = inventoryPeriodValueRes.success
    ? (inventoryPeriodValueRes.data?.closingValue ?? currentInventoryValue)
    : currentInventoryValue;
  const inventoryOpeningValue = inventoryPeriodValueRes.success
    ? (inventoryPeriodValueRes.data?.openingValue ?? inventoryValue)
    : inventoryValue;

  const canViewInventoryValuation =
    canReadRequestedValuation && includesBranchData;

  const goodsInKind = periodGoodsInKindForLocation(params.location);
  const kpis = buildKpis({
    kpis: kpisRes.success ? (kpisRes.data as KpiBundle | null) : null,
    actualFoodCost,
    goodsIn: periodGoodsIn,
    goodsInKind,
    inventoryValue,
    inventoryOpeningValue,
    operatingExpense: operatingExpenseSummary,
    startupCapital: startupCapitalSummary,
    includeInventoryChange: canViewInventoryValuation,
  });

  const compareKpis = resolved.compare
    ? buildKpis({
        kpis: compareKpisRes.success
          ? (compareKpisRes.data as KpiBundle | null)
          : null,
        actualFoodCost: compareActualFoodCost,
        goodsIn: comparePeriodGoodsIn,
        goodsInKind,
        inventoryValue,
        operatingExpense: compareOperatingExpenseSummary,
        startupCapital: {
          total: 0,
          recorded: false,
          equipment: 0,
          equipmentRecorded: false,
        },
        includeInventoryChange: canViewInventoryValuation,
      })
    : null;

  const cashVarianceHref =
    cashVarianceTarget != null
      ? `/br/${String(cashVarianceTarget.branch_id)}/pos-sessions?session=${String(cashVarianceTarget.session_id)}`
      : params.branch != null
        ? `/br/${String(params.branch)}/pos-sessions`
        : undefined;
  const reconciliationHref = financeHref(
    "/finance/bank-transactions",
    {
      ...params,
      range: "custom",
      period: null,
      from: resolved.start,
      to: resolved.end,
    },
    { recon: "needs_review" },
  );
  const dashboardSummary = dashboardSummaryRes.success
    ? (dashboardSummaryRes.data as FinanceDashboardSummary | null)
    : null;

  return {
    branches,
    canViewInventoryValuation,
    vat,
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
    dashboardSummary,
    exceptions: buildExceptions({
      params,
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
    ...(cash != null ? { cash } : {}),
  };
}
