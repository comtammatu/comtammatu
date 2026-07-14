import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import type { FinanceParams, ResolvedFinanceRange } from "./finance-params";
import { calculateSepayBankBalance } from "./sepay-bank-transaction-model";
import { fetchSepayBankMovementSince } from "./sepay-bank-transactions";

/**
 * Cash-basis view (D028 deliverable 3): the cash book the HKD owner thinks in.
 *
 * Two truths, deliberately distinct:
 *  - Running cash fund: tenant-level, "now". Anchored by an owner-counted
 *    opening balance + date in system_settings; from there we add cash collected
 *    and subtract cash spent. Only meaningful once anchored — without an
 *    opening, summing all-time cash would assume zero withdrawals.
 *  - Period operating cash signal: respects the cockpit branch/date filter and
 *    excludes internal cash-to-bank transfers and manual materials cost.
 */

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireLedgerNumber(
  value: number | string | null | undefined,
  field: string,
): number {
  if (value == null || value === "") {
    console.error("[finance:cash] ledger field missing", field);
    throw new Error("Unable to load cash movement");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    console.error("[finance:cash] ledger field invalid", field);
    throw new Error("Unable to load cash movement");
  }
  return parsed;
}

export interface CashSummary {
  hasOpening: boolean;
  openingBalance: number;
  openingDate: string | null;
  cashInSince: number;
  cashOutSince: number;
  cashOnHand: number;
  /** Whether the owner has set a bank-account opening balance (shares openingDate). */
  hasBankOpening: boolean;
  bankOpeningBalance: number;
  /** SePay incoming transfers since openingDate. */
  bankInSince: number;
  /** SePay outgoing transfers since openingDate. */
  bankOutSince: number;
  bankOnHand: number;
  /** Actual cash collected in the selected branch/date period. */
  cashCollectedPeriod: number;
  /** Approved cash refunds in the selected period. */
  cashRefundPeriod: number;
  /** Cash-only operating expenses in the selected period. */
  cashExpensePeriod: number;
  /** Cash-only supplier payments in the selected period. */
  cashSupplierPaymentPeriod: number;
  /** Cash refunds + expenses + supplier payments in the selected period. */
  cashOutPeriod: number;
  /** Cash collected minus cash out in the selected period. */
  cashNetMovementPeriod: number;
}

const EMPTY_OPENING = {
  hasOpening: false,
  openingBalance: 0,
  openingDate: null,
  cashInSince: 0,
  cashOutSince: 0,
  cashOnHand: 0,
  hasBankOpening: false,
  bankOpeningBalance: 0,
  bankInSince: 0,
  bankOutSince: 0,
  bankOnHand: 0,
} as const;

type CashLedgerMovementRpcClient = {
  rpc: (
    fn: "get_cash_ledger_movement_since",
    args: { p_since: string },
  ) => PromiseLike<{
    data: {
      cash_collections?: number;
      cash_refunds?: number;
      cash_expenses?: number;
      cash_supplier_payments?: number;
    } | null;
    error: { code?: string } | null;
  }>;
};

type PeriodOperatingCashMovementRpcClient = {
  rpc: (
    fn: "get_operating_cash_movement_for_period",
    args: {
      p_start_date: string;
      p_end_date: string;
      p_branch_id: number | null;
    },
  ) => PromiseLike<{
    data: {
      cash_collections?: number;
      cash_refunds?: number;
      cash_expenses?: number;
      cash_supplier_payments?: number;
      cash_out?: number;
      net_cash_movement?: number;
    } | null;
    error: { code?: string } | null;
  }>;
};

async function fetchCashLedgerMovementSince(
  supabase: SupabaseClient,
  startIso: string,
): Promise<{
  collections: number;
  refunds: number;
  expenses: number;
  supplierPayments: number;
}> {
  const { data, error } = await (
    supabase as unknown as CashLedgerMovementRpcClient
  ).rpc("get_cash_ledger_movement_since", { p_since: startIso });

  if (error) {
    console.error("[finance:cash] failed to load cash movement", error.code);
    throw new Error("Unable to load cash movement");
  }

  return {
    collections: requireLedgerNumber(
      data?.cash_collections,
      "cash_collections",
    ),
    refunds: requireLedgerNumber(data?.cash_refunds, "cash_refunds"),
    expenses: requireLedgerNumber(data?.cash_expenses, "cash_expenses"),
    supplierPayments: requireLedgerNumber(
      data?.cash_supplier_payments,
      "cash_supplier_payments",
    ),
  };
}

async function fetchPeriodOperatingCashMovement(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  branchId: number | null,
) {
  const { data, error } = await (
    supabase as unknown as PeriodOperatingCashMovementRpcClient
  ).rpc("get_operating_cash_movement_for_period", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_branch_id: branchId,
  });

  if (error) {
    console.error("[finance:cash] failed to load period movement", error.code);
    throw new Error("Unable to load period cash movement");
  }

  return {
    collections: requireLedgerNumber(
      data?.cash_collections,
      "cash_collections",
    ),
    refunds: requireLedgerNumber(data?.cash_refunds, "cash_refunds"),
    expenses: requireLedgerNumber(data?.cash_expenses, "cash_expenses"),
    supplierPayments: requireLedgerNumber(
      data?.cash_supplier_payments,
      "cash_supplier_payments",
    ),
    cashOut: requireLedgerNumber(data?.cash_out, "cash_out"),
    netMovement: requireLedgerNumber(
      data?.net_cash_movement,
      "net_cash_movement",
    ),
  };
}

export async function fetchCashSummary(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<CashSummary> {
  const { supabase, claims } = await loadAuthState();
  const tenantId = claims.tenant_id;
  const periodMovement = await fetchPeriodOperatingCashMovement(
    supabase,
    resolved.start,
    resolved.end,
    params.branch,
  );

  // Opening anchor (tenant-level).
  const { data: settingRows } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [
      SYSTEM_SETTING_KEYS.CASH_OPENING_BALANCE,
      SYSTEM_SETTING_KEYS.CASH_OPENING_DATE,
      SYSTEM_SETTING_KEYS.BANK_OPENING_BALANCE,
    ]);
  const settingMap = new Map(
    (settingRows ?? []).map((row) => [row.key, row.value]),
  );
  const openingDate =
    settingMap.get(SYSTEM_SETTING_KEYS.CASH_OPENING_DATE) || null;
  const openingBalance = toNumber(
    settingMap.get(SYSTEM_SETTING_KEYS.CASH_OPENING_BALANCE),
  );

  if (!openingDate) {
    return {
      ...EMPTY_OPENING,
      cashCollectedPeriod: periodMovement.collections,
      cashRefundPeriod: periodMovement.refunds,
      cashExpensePeriod: periodMovement.expenses,
      cashSupplierPaymentPeriod: periodMovement.supplierPayments,
      cashOutPeriod: periodMovement.cashOut,
      cashNetMovementPeriod: periodMovement.netMovement,
    };
  }

  // Running balances are tenant-wide from the anchor date. A refunded cash
  // payment remains an actual collection, while its approved payout is a
  // separate cash outflow. Bank balance uses signed SePay movement only.
  const openingStart = getVNDayUtcRange(openingDate).startIso;
  const [cashMovement, bankMovement] = await Promise.all([
    fetchCashLedgerMovementSince(supabase, openingStart),
    fetchSepayBankMovementSince(supabase, openingStart),
  ]);
  const cashInSince = cashMovement.collections;
  const cashOutSince =
    cashMovement.expenses +
    cashMovement.supplierPayments +
    cashMovement.refunds;
  const bankInSince = bankMovement.inAmount;
  const bankOutSince = bankMovement.outAmount;

  const bankSettingRaw = settingMap.get(
    SYSTEM_SETTING_KEYS.BANK_OPENING_BALANCE,
  );
  const hasBankOpening = bankSettingRaw != null && bankSettingRaw !== "";
  const bankOpeningBalance = toNumber(bankSettingRaw);

  return {
    hasOpening: true,
    openingBalance,
    openingDate,
    cashInSince,
    cashOutSince,
    cashOnHand: openingBalance + cashInSince - cashOutSince,
    hasBankOpening,
    bankOpeningBalance,
    bankInSince,
    bankOutSince,
    bankOnHand: calculateSepayBankBalance(bankOpeningBalance, bankMovement),
    cashCollectedPeriod: periodMovement.collections,
    cashRefundPeriod: periodMovement.refunds,
    cashExpensePeriod: periodMovement.expenses,
    cashSupplierPaymentPeriod: periodMovement.supplierPayments,
    cashOutPeriod: periodMovement.cashOut,
    cashNetMovementPeriod: periodMovement.netMovement,
  };
}
