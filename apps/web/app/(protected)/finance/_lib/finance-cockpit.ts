import {
  formatAccountingVND as formatVND,
  formatCount,
} from "@comtammatu/shared/format";
import { addMoney, roundToCanonicalMoney } from "@comtammatu/shared/money";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches, type FinanceDashboardSummary } from "../actions";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type {
  FinanceLocation,
  FinanceParams,
  ResolvedFinanceRange,
} from "./finance-params";
import { financeHref } from "./finance-params";
import {
  periodGoodsInKindForLocation,
  type PeriodGoodsInKind,
} from "./finance-goods-in";
import { calculateFinanceResult } from "./finance-result";
import { isStartupCapitalCategory } from "./expense-categories";
import {
  parseFinanceOperatingCockpitRpc,
  type FinanceOperatingCockpitRpc,
} from "./finance-operating-rpc";
import {
  applySalesBranchesFilter,
  fetchSalesBranchIds,
} from "./finance-sales-branches";
import { fetchCashSummary, type CashSummary } from "./cash-cockpit";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

const copy = messages.finance.powerLite;

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

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeStartupCapital(
  rows: Array<{ amount: number | string | null; category: string | null }>,
): StartupCapitalSummary {
  const capitalRows = rows.filter(
    (row): row is { amount: number | string | null; category: string } =>
      row.category != null && isStartupCapitalCategory(row.category),
  );
  const equipmentRows = capitalRows.filter((row) => row.category === "capital");

  return {
    total: toNumber(
      addMoney(capitalRows.map((row) => roundToCanonicalMoney(row.amount ?? 0))),
    ),
    recorded: capitalRows.length > 0,
    equipment: toNumber(
      addMoney(
        equipmentRows.map((row) => roundToCanonicalMoney(row.amount ?? 0)),
      ),
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

async function fetchOperatingCockpitRpc({
  supabase,
  location,
  branchId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  location: FinanceLocation;
  branchId: number | null;
  startDate: string;
  endDate: string;
}): Promise<FinanceOperatingCockpitRpc | null> {
  const { data, error } = await supabase.rpc("get_finance_operating_cockpit", {
    p_location: location,
    p_start_date: startDate,
    p_end_date: endDate,
    ...(location === "branch" && branchId != null
      ? { p_branch_id: branchId }
      : {}),
  });
  if (error) {
    console.error("[finance:operating-cockpit] RPC failed", error.code);
    return null;
  }
  return parseFinanceOperatingCockpitRpc(data);
}

function buildKpisFromCockpit({
  cockpit,
  startupCapital,
  includeInventoryChange,
}: {
  cockpit: FinanceOperatingCockpitRpc;
  startupCapital: StartupCapitalSummary;
  includeInventoryChange: boolean;
}): FinanceCockpitKpis {
  const orderCount = cockpit.orderCount;
  const netRevenueBeforeVat = cockpit.subtotalRevenue - cockpit.discountAmount;
  const ingredientCost = cockpit.foodCost.ingredientCost;
  const costCoverageOrderCount = cockpit.foodCost.coveredOrderCount;
  const costCoverageRatio =
    orderCount > 0 ? costCoverageOrderCount / orderCount : 1;
  const costAvailable =
    orderCount === 0 || costCoverageOrderCount >= orderCount;
  const inventoryChange = includeInventoryChange
    ? cockpit.inventoryClosing - cockpit.inventoryOpening
    : 0;
  const financeResult = calculateFinanceResult({
    netRevenueBeforeVat,
    goodsIn: cockpit.goodsIn,
    ingredientCost,
    operatingExpense: cockpit.operatingExpenseTotal,
    inventoryChange,
    costAvailable,
    operatingExpenseRecorded: cockpit.operatingExpenseRecorded,
    costReadable: cockpit.foodCost.valuationActive,
  });

  return {
    totalCollected: cockpit.netRevenue,
    orderCount,
    netRevenueBeforeVat,
    inventoryValue: cockpit.inventoryClosing,
    inventoryOpeningValue: cockpit.inventoryOpening,
    operatingExpense: cockpit.operatingExpenseTotal,
    operatingExpenseRecorded: cockpit.operatingExpenseRecorded,
    startupCapital: startupCapital.total,
    startupCapitalRecorded: startupCapital.recorded,
    equipment: startupCapital.equipment,
    equipmentRecorded: startupCapital.equipmentRecorded,
    goodsIn: cockpit.goodsIn,
    goodsInKind: cockpit.goodsInKind,
    ingredientCost,
    ...financeResult,
    costAvailable,
    costCoverageOrderCount,
    costCoverageRatio,
    cashRevenue: cockpit.cashRevenue,
    vietqrRevenue: cockpit.vietqrRevenue,
  };
}

function emptyKpis(goodsInKind: PeriodGoodsInKind): FinanceCockpitKpis {
  return {
    totalCollected: 0,
    orderCount: 0,
    netRevenueBeforeVat: 0,
    inventoryValue: 0,
    inventoryOpeningValue: 0,
    inventoryChange: 0,
    operatingExpense: 0,
    operatingExpenseRecorded: false,
    startupCapital: 0,
    startupCapitalRecorded: false,
    equipment: 0,
    equipmentRecorded: false,
    goodsIn: 0,
    goodsInKind,
    ingredientCost: 0,
    grossProfit: null,
    grossMargin: null,
    operatingResult: null,
    costAvailable: true,
    costCoverageOrderCount: 0,
    costCoverageRatio: 1,
    cashRevenue: 0,
    vietqrRevenue: 0,
  };
}

function buildExceptions({
  params,
  kpis,
  dashboardSummary,
  cashVarianceAbs,
  cashVarianceSessions,
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
  cashVarianceAbs: number;
  cashVarianceSessions: number;
  unpaidSupplierInvoices: { count: number; amount: number };
  paymentDesync: { count: number; amount: number };
  cashVarianceHref?: string;
  reconciliationAttention: {
    unmatched_bank_count: number;
    unmatched_bank_amount: number;
    missing_vietqr_count: number;
    missing_vietqr_amount: number;
  } | null;
  reconciliationHref: string;
}): FinanceException[] {
  const missingCostCount = Math.max(
    0,
    kpis.orderCount - kpis.costCoverageOrderCount,
  );
  const invoiceAttentionCount = dashboardSummary?.invoice_attention_count ?? 0;

  return [
    {
      label: copy.exceptions.cashVarianceLabel,
      value: formatVND(cashVarianceAbs),
      hint:
        cashVarianceSessions > 0
          ? copy.exceptions.cashVarianceClosedSessions(
              formatCount(cashVarianceSessions),
            )
          : "",
      href: cashVarianceHref,
      tone:
        cashVarianceAbs >= 500_000
          ? "destructive"
          : cashVarianceAbs > 0
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
          : copy.exceptions.costDataClear,
      href: financeHref("/finance/food-cost", params),
      tone: missingCostCount > 0 ? "warning" : "neutral",
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
      href: financeHref("/finance/bank-transactions", params, {
        recon: "needs_review",
      }),
      tone: paymentDesync.count > 0 ? "warning" : "neutral",
    },
  ];
}

function exceptionsFromCockpit(
  params: FinanceParams,
  cockpit: FinanceOperatingCockpitRpc,
  kpis: FinanceCockpitKpis,
): FinanceException[] {
  const ex = cockpit.exceptions;
  const cashVarianceHref =
    ex.cashVarianceSessionId != null && ex.cashVarianceBranchId != null
      ? `/br/${String(ex.cashVarianceBranchId)}/pos-sessions?session=${String(ex.cashVarianceSessionId)}`
      : params.branch != null
        ? `/br/${String(params.branch)}/pos-sessions`
        : undefined;
  const reconciliationHref = financeHref(
    "/finance/bank-transactions",
    {
      ...params,
      range: "custom",
      period: null,
      from: params.from,
      to: params.to,
    },
    { recon: "needs_review" },
  );

  return buildExceptions({
    params,
    kpis,
    dashboardSummary: {
      invoice_attention_count: ex.invoiceAttentionCount,
    },
    cashVarianceAbs: ex.cashVarianceAbs,
    cashVarianceSessions: ex.cashVarianceSessions,
    unpaidSupplierInvoices: {
      count: ex.unpaidApCount,
      amount: ex.unpaidApAmount,
    },
    paymentDesync: {
      count: ex.paymentDesyncCount,
      amount: ex.paymentDesyncAmount,
    },
    cashVarianceHref,
    reconciliationAttention: {
      unmatched_bank_count: ex.unmatchedBankCount,
      unmatched_bank_amount: ex.unmatchedBankAmount,
      missing_vietqr_count: ex.missingVietqrCount,
      missing_vietqr_amount: ex.missingVietqrAmount,
    },
    reconciliationHref,
  });
}

/** Home `/` attention only — exception counts/hrefs, not the full cockpit. */
export async function fetchFinanceAttentionExceptions(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<FinanceException[]> {
  const { supabase } = await loadAuthState();
  const canView = await currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW);
  if (!canView) return [];

  const cockpit = await fetchOperatingCockpitRpc({
    supabase,
    location: params.location,
    branchId: params.branch,
    startDate: resolved.start,
    endDate: resolved.end,
  });
  if (!cockpit) return [];

  const kpis = buildKpisFromCockpit({
    cockpit,
    startupCapital: {
      total: 0,
      recorded: false,
      equipment: 0,
      equipmentRecorded: false,
    },
    includeInventoryChange: false,
  });

  return exceptionsFromCockpit(params, cockpit, kpis).filter(
    (item) => item.tone !== "neutral",
  );
}

export async function fetchFinanceCockpit(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
  options?: FinanceCockpitOptions,
): Promise<FinanceCockpitData> {
  const { supabase, claims } = await loadAuthState();
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const includesBranchData = params.location !== "company";
  const canReadRequestedValuation =
    monetary.client != null &&
    (params.branch == null ||
      (await canAccessBranch(supabase, claims, params.branch)));

  const salesBranchIds = includesBranchData
    ? await fetchSalesBranchIds(supabase as never, claims.tenant_id)
    : null;

  // Hub loader: operating cockpit (+ compare) + funds + branches + startup.
  const [
    branchesRes,
    cockpit,
    compareCockpit,
    startupCapitalSummary,
    cash,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchOperatingCockpitRpc({
      supabase,
      location: params.location,
      branchId: params.branch,
      startDate: resolved.start,
      endDate: resolved.end,
    }),
    resolved.compare
      ? fetchOperatingCockpitRpc({
          supabase,
          location: params.location,
          branchId: params.branch,
          startDate: resolved.compare.start,
          endDate: resolved.compare.end,
        })
      : Promise.resolve(null),
    fetchStartupCapitalSummary({
      supabase,
      tenantId: claims.tenant_id,
      location: params.location,
      branchId: params.branch,
      salesBranchIds,
    }),
    options?.includeCash
      ? fetchCashSummary(supabase)
      : Promise.resolve(undefined),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as BranchOption[];
  const goodsInKind = periodGoodsInKindForLocation(params.location);
  const canViewInventoryValuation =
    canReadRequestedValuation &&
    includesBranchData &&
    (cockpit?.inventoryReadable ?? false);

  const kpis = cockpit
    ? buildKpisFromCockpit({
        cockpit,
        startupCapital: startupCapitalSummary,
        includeInventoryChange: canViewInventoryValuation,
      })
    : {
        ...emptyKpis(goodsInKind),
        startupCapital: startupCapitalSummary.total,
        startupCapitalRecorded: startupCapitalSummary.recorded,
        equipment: startupCapitalSummary.equipment,
        equipmentRecorded: startupCapitalSummary.equipmentRecorded,
      };

  const compareKpisBuilt =
    compareCockpit != null
      ? buildKpisFromCockpit({
          cockpit: compareCockpit,
          startupCapital: {
            total: 0,
            recorded: false,
            equipment: 0,
            equipmentRecorded: false,
          },
          includeInventoryChange: canViewInventoryValuation,
        })
      : null;

  const dashboardSummary: FinanceDashboardSummary | null = cockpit
    ? {
        invoice_attention_count: cockpit.exceptions.invoiceAttentionCount,
        invoice_issued_count: 0,
        invoice_not_required_count: 0,
        failed_webhook_count: 0,
      }
    : null;

  return {
    branches,
    canViewInventoryValuation,
    vat: { inputRecorded: null, outputIssued: null },
    kpis,
    compareKpis: compareKpisBuilt
      ? {
          totalCollected: compareKpisBuilt.totalCollected,
          netRevenueBeforeVat: compareKpisBuilt.netRevenueBeforeVat,
          orderCount: compareKpisBuilt.orderCount,
          operatingExpense: compareKpisBuilt.operatingExpense,
          ingredientCost: compareKpisBuilt.ingredientCost,
          grossProfit: compareKpisBuilt.grossProfit,
          costAvailable: compareKpisBuilt.costAvailable,
        }
      : null,
    dashboardSummary,
    exceptions: cockpit
      ? exceptionsFromCockpit(params, cockpit, kpis)
      : [],
    ...(cash != null ? { cash } : {}),
  };
}
