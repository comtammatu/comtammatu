import {
  formatAccountingVND as formatVND,
  formatCount,
} from "@comtammatu/shared/format";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { messages } from "@lib/messages";
import {
  fetchAccessibleBranches,
  type FinanceDashboardSummary,
} from "../actions";
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
import {
  parseFinanceOperatingCockpitRpc,
  type FinanceInventoryBreakdownRpc,
  type FinanceOperatingCockpitRpc,
} from "./finance-operating-rpc";
import {
  fetchPeriodReadiness,
  type PeriodReadinessRpc,
} from "./finance-period-readiness";
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
  /** Startup-capital RPC failed — the cards must show a load error, not zero. */
  startupCapitalLoadFailed: boolean;
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
  inventoryBreakdown: FinanceInventoryBreakdownRpc[];
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
  dashboardSummary: FinanceDashboardSummary | null;
  cash?: CashSummary;
  /**
   * Read-only period-close readiness (Sức khoẻ chốt sổ); only fetched for
   * the sealed `last_month` range, null everywhere else. Never exposes a
   * close/reopen action.
   */
  readiness: PeriodReadinessRpc | null;
}

interface BranchOption {
  id: number;
  name: string;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Defensive jsonb parser for get_finance_startup_capital_summary: the
 * payload may arrive as a JSON string depending on the RPC transport.
 * Returns null on any unparseable shape so the caller can surface a load
 * failure instead of a silent zero summary.
 */
function parseStartupCapitalSummaryRpc(
  raw: unknown,
): StartupCapitalSummary | null {
  let payload: unknown = raw;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  if (
    payload == null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const row = payload as Record<string, unknown>;
  const startupTotal = row.startup_total;
  const equipmentTotal = row.equipment_total;
  if (
    (typeof startupTotal !== "number" && typeof startupTotal !== "string") ||
    (typeof equipmentTotal !== "number" && typeof equipmentTotal !== "string")
  ) {
    return null;
  }
  // Validate the numeric form before building the summary: a non-finite
  // parse (e.g. "12.5.3") must surface as a load failure, never be
  // coerced into a silent zero total.
  const parsedStartupTotal = Number(startupTotal);
  const parsedEquipmentTotal = Number(equipmentTotal);
  if (
    !Number.isFinite(parsedStartupTotal) ||
    !Number.isFinite(parsedEquipmentTotal)
  ) {
    return null;
  }
  return {
    total: parsedStartupTotal,
    recorded: row.startup_recorded === true,
    equipment: parsedEquipmentTotal,
    equipmentRecorded: row.equipment_recorded === true,
  };
}

async function fetchStartupCapitalSummary({
  supabase,
  location,
  branchId,
}: {
  supabase: SupabaseClient;
  location: FinanceLocation;
  branchId: number | null;
}): Promise<StartupCapitalSummary | null> {
  // All-time Chi phí ban đầu / Thiết bị truth lives server-side; the RPC
  // ignores the period by design and never enters the period result.
  const { data, error } = await supabase.rpc(
    "get_finance_startup_capital_summary",
    {
      p_location: location,
      ...(location === "branch" && branchId != null
        ? { p_branch_id: branchId }
        : {}),
    },
  );
  if (error) {
    console.error("[finance:startup-capital] RPC failed", error.code);
    return null;
  }
  return parseStartupCapitalSummaryRpc(data);
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
  const inventoryChange = includeInventoryChange ? cockpit.inventoryChange : 0;
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
    startupCapitalLoadFailed: false,
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
    startupCapitalLoadFailed: false,
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
  const canView = await currentUserHasPermissionAny(
    PERMISSION_KEYS.FINANCE_VIEW,
  );
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
  const canReadRequestedValuation =
    monetary.client != null &&
    (params.branch == null ||
      (await canAccessBranch(supabase, claims, params.branch)));

  // Period-close readiness (get_finance_period_close_readiness) is only
  // meaningful for a sealed calendar month: exactly the last_month preset.
  // mtd/today/custom stay quiet so no mid-month noise reaches the landing.
  const [readinessYearPart, readinessMonthPart] = resolved.end
    .slice(0, 7)
    .split("-");
  const readinessYear = Number(readinessYearPart);
  const readinessMonth = Number(readinessMonthPart);
  const readinessEnabled =
    params.range === "last_month" &&
    Number.isInteger(readinessYear) &&
    Number.isInteger(readinessMonth);

  // Hub loader: operating cockpit (+ compare) + funds + branches + startup.
  const [
    branchesRes,
    cockpit,
    compareCockpit,
    startupCapitalSummary,
    cash,
    readiness,
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
      location: params.location,
      branchId: params.branch,
    }),
    options?.includeCash
      ? fetchCashSummary(supabase)
      : Promise.resolve(undefined),
    readinessEnabled
      ? fetchPeriodReadiness({
          supabase,
          year: readinessYear,
          month: readinessMonth,
          branchId: params.branch,
        })
      : Promise.resolve(null),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as BranchOption[];
  const goodsInKind = periodGoodsInKindForLocation(params.location);
  // Gate on the server flags: the RPC reports readability and inclusion per
  // scope (company sums every valued branch), so the client no longer
  // hard-requires branch data. The branch-access check inside
  // canReadRequestedValuation still applies only when params.branch is set.
  const canViewInventoryValuation =
    canReadRequestedValuation &&
    (cockpit?.inventoryReadable ?? false) &&
    (cockpit?.inventoryChangeIncluded ?? false);

  // A null summary means the RPC failed or returned an unparseable payload:
  // keep the values at zero/unrecorded but flag the load failure so the
  // landing renders an error instead of the silent "Chưa ghi nhận" shape.
  const startupCapitalLoadFailed = startupCapitalSummary == null;
  const kpis = cockpit
    ? {
        ...buildKpisFromCockpit({
          cockpit,
          startupCapital: startupCapitalSummary ?? {
            total: 0,
            recorded: false,
            equipment: 0,
            equipmentRecorded: false,
          },
          includeInventoryChange: canViewInventoryValuation,
        }),
        startupCapitalLoadFailed,
      }
    : {
        ...emptyKpis(goodsInKind),
        startupCapital: startupCapitalSummary?.total ?? 0,
        startupCapitalRecorded: startupCapitalSummary?.recorded ?? false,
        equipment: startupCapitalSummary?.equipment ?? 0,
        equipmentRecorded: startupCapitalSummary?.equipmentRecorded ?? false,
        startupCapitalLoadFailed,
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
    inventoryBreakdown: cockpit?.inventoryBreakdown ?? [],
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
    ...(cash != null ? { cash } : {}),
    readiness,
  };
}
