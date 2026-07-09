import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import { fetchRevenueKpis } from "../actions";
import type { FinanceParams, ResolvedFinanceRange } from "./finance-params";
import { fetchSepayBankMovementSince } from "./sepay-bank-transactions";

/**
 * Cash-basis view (D028 deliverable 3): the cash book the HKD owner thinks in.
 *
 * Two truths, deliberately distinct:
 *  - Running cash fund: tenant-level, "now". Anchored by an owner-counted
 *    opening balance + date in system_settings; from there we add cash collected
 *    and subtract cash spent. Only meaningful once anchored — without an
 *    opening, summing all-time cash would assume zero withdrawals.
 *  - Period cash figures: respect the cockpit branch/date filter; feed the
 *    cash-basis profit (tiền thực thu − chi đã trả) computed in the page.
 */

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

interface ExpenseMatchRow {
  expense_id: number;
}

interface SupplierPaymentRow {
  amount: number | string | null;
  payment_method: string | null;
  supplier_invoices?:
    | {
        goods_received_notes?:
          | {
              branch_id: number | string | null;
            }
          | Array<{ branch_id: number | string | null }>
          | null;
      }
    | Array<{
        goods_received_notes?:
          | {
              branch_id: number | string | null;
            }
          | Array<{ branch_id: number | string | null }>
          | null;
      }>
    | null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getSupplierPaymentBranchId(row: SupplierPaymentRow): number | null {
  const invoice = firstRelation(row.supplier_invoices);
  const grn = firstRelation(invoice?.goods_received_notes);
  const branchId = grn?.branch_id;
  return branchId == null ? null : toNumber(branchId);
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
  /** Period expenses actually paid out (cash + transfer, excludes 'unpaid'). */
  expensesPaidPeriod: number;
  /** Period supplier AP payments actually paid out. */
  supplierPaymentsPaidPeriod: number;
  /** Period cash out: expenses paid + supplier AP payments paid. */
  cashOutPaidPeriod: number;
  /** Period cash-only expenses. */
  cashExpensePeriod: number;
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

async function sumExpensesSinceByMethod(
  supabase: SupabaseClient,
  tenantId: number,
  sinceDate: string,
): Promise<{ cash: number; unmatchedTransfer: number }> {
  const matchedExpenseIds = new Set<number>();

  const { data: matchedRows } = await supabase
    .from("bank_transaction_expense_matches")
    .select("expense_id")
    .eq("tenant_id", tenantId);

  for (const row of (matchedRows ?? []) as ExpenseMatchRow[]) {
    matchedExpenseIds.add(row.expense_id);
  }

  const { data: matchedEvents } = await supabase
    .from("webhook_events")
    .select("expense_id")
    .eq("tenant_id", tenantId)
    .not("expense_id", "is", null);

  for (const row of matchedEvents ?? []) {
    if (row.expense_id != null) matchedExpenseIds.add(row.expense_id);
  }

  const { data } = await supabase
    .from("expenses")
    .select("id, amount, payment_method")
    .eq("tenant_id", tenantId)
    .in("payment_method", ["cash", "transfer"])
    .gte("expense_date", sinceDate);

  let cash = 0;
  let unmatchedTransfer = 0;
  for (const row of data ?? []) {
    const amount = toNumber(row.amount);
    if (row.payment_method === "cash") {
      cash += amount;
    } else if (
      row.payment_method === "transfer" &&
      !matchedExpenseIds.has(row.id)
    ) {
      unmatchedTransfer += amount;
    }
  }
  return { cash, unmatchedTransfer };
}

async function sumSupplierPaymentsByMethod(
  supabase: SupabaseClient,
  tenantId: number,
  startIso: string,
  endIso?: string,
  branchId?: number | null,
): Promise<{ cash: number; bankTransfer: number }> {
  let query = supabase
    .from("supplier_payments")
    .select(
      "amount, payment_method, supplier_invoices ( goods_received_notes ( branch_id ) )",
    )
    .eq("tenant_id", tenantId)
    .gte("payment_date", startIso);

  if (endIso) {
    query = query.lt("payment_date", endIso);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[finance:cash] failed to load supplier_payments", error.code);
    return { cash: 0, bankTransfer: 0 };
  }

  let cash = 0;
  let bankTransfer = 0;
  for (const row of (data ?? []) as SupplierPaymentRow[]) {
    if (branchId != null && getSupplierPaymentBranchId(row) !== branchId) {
      continue;
    }
    const amount = toNumber(row.amount);
    if (row.payment_method === "cash") cash += amount;
    if (row.payment_method === "bank_transfer") bankTransfer += amount;
  }
  return { cash, bankTransfer };
}

export async function fetchCashSummary(
  params: FinanceParams,
  resolved: ResolvedFinanceRange,
): Promise<CashSummary> {
  const { supabase, claims } = await loadAuthState();
  const tenantId = claims.tenant_id;

  // Period expense breakdown (respects branch filter).
  let periodQuery = supabase
    .from("expenses")
    .select("amount, payment_method")
    .eq("tenant_id", tenantId)
    .neq("category", "bank_deposit")
    .gte("expense_date", resolved.start)
    .lte("expense_date", resolved.end);
  if (params.branch != null) {
    periodQuery = periodQuery.eq("branch_id", params.branch);
  }
  const { data: periodRows } = await periodQuery;
  let expensesPaidPeriod = 0;
  let cashExpensePeriod = 0;
  for (const row of periodRows ?? []) {
    const amount = toNumber(row.amount);
    if (row.payment_method !== "unpaid") expensesPaidPeriod += amount;
    if (row.payment_method === "cash") cashExpensePeriod += amount;
  }
  const periodStart = getVNDayUtcRange(resolved.start).startIso;
  const periodEnd = getVNDayUtcRange(resolved.end).endIso;
  const supplierPaymentsPeriod = await sumSupplierPaymentsByMethod(
    supabase,
    tenantId,
    periodStart,
    periodEnd,
    params.branch,
  );
  const supplierPaymentsPaidPeriod =
    supplierPaymentsPeriod.cash + supplierPaymentsPeriod.bankTransfer;
  const cashOutPaidPeriod = expensesPaidPeriod + supplierPaymentsPaidPeriod;

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
      expensesPaidPeriod,
      supplierPaymentsPaidPeriod,
      cashOutPaidPeriod,
      cashExpensePeriod,
    };
  }

  // Running balances are tenant-wide from the anchor date: cash uses POS cash,
  // bank uses signed SePay account movement plus recorded transfer spend.
  const today = getVNDateString();
  const openingStart = getVNDayUtcRange(openingDate).startIso;
  const [revRes, expensesSince, supplierPaymentsSince, bankMovement] =
    await Promise.all([
      fetchRevenueKpis(null, openingDate, today),
      sumExpensesSinceByMethod(supabase, tenantId, openingDate),
      sumSupplierPaymentsByMethod(supabase, tenantId, openingStart),
      fetchSepayBankMovementSince(supabase, tenantId, openingDate),
    ]);
  const revData = revRes.success
    ? (revRes.data as {
        cash_revenue?: number;
      } | null)
    : null;
  const cashInSince = toNumber(revData?.cash_revenue);
  const cashOutSince = expensesSince.cash + supplierPaymentsSince.cash;
  const bankInSince = bankMovement.inAmount;
  const bankOutSince =
    bankMovement.outAmount +
    expensesSince.unmatchedTransfer +
    supplierPaymentsSince.bankTransfer;

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
    bankOnHand: bankOpeningBalance + bankInSince - bankOutSince,
    expensesPaidPeriod,
    supplierPaymentsPaidPeriod,
    cashOutPaidPeriod,
    cashExpensePeriod,
  };
}
