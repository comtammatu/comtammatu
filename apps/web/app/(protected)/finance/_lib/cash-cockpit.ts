import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { loadAuthState } from "@/_lib/auth";
import { fetchRevenueKpis } from "../actions";
import type { FinanceParams, ResolvedFinanceRange } from "./finance-params";

/**
 * Cash-basis view (D028 deliverable 3): the cash book the HKD owner thinks in.
 *
 * Two truths, deliberately distinct:
 *  - Running quỹ (tiền mặt hiện hữu): tenant-level, "now". Anchored by an
 *    owner-counted opening balance + date in system_settings; from there we add
 *    cash collected and subtract cash spent. Only meaningful once anchored —
 *    without an opening, summing all-time cash would assume zero withdrawals.
 *  - Period cash figures: respect the cockpit branch/date filter; feed the
 *    cash-basis profit (tiền thực thu − chi đã trả) computed in the page.
 */

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface CashSummary {
  hasOpening: boolean;
  openingBalance: number;
  openingDate: string | null;
  cashInSince: number;
  cashOutSince: number;
  cashOnHand: number;
  /** Period expenses actually paid out (cash + transfer, excludes 'unpaid'). */
  expensesPaidPeriod: number;
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
} as const;

async function sumCashExpensesSince(
  supabase: SupabaseClient,
  tenantId: number,
  sinceDate: string,
): Promise<number> {
  const { data } = await supabase
    .from("expenses")
    .select("amount")
    .eq("tenant_id", tenantId)
    .eq("payment_method", "cash")
    .gte("expense_date", sinceDate);
  return (data ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0);
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

  // Opening anchor (tenant-level).
  const { data: settingRows } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [
      SYSTEM_SETTING_KEYS.CASH_OPENING_BALANCE,
      SYSTEM_SETTING_KEYS.CASH_OPENING_DATE,
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
    return { ...EMPTY_OPENING, expensesPaidPeriod, cashExpensePeriod };
  }

  // Running quỹ: cash collected (DB-side via revenue RPC) − cash spent, since
  // the anchor date, tenant-wide.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const revRes = await fetchRevenueKpis(null, openingDate, today);
  const cashInSince = revRes.success
    ? toNumber((revRes.data as { cash_revenue?: number } | null)?.cash_revenue)
    : 0;
  const cashOutSince = await sumCashExpensesSince(
    supabase,
    tenantId,
    openingDate,
  );

  return {
    hasOpening: true,
    openingBalance,
    openingDate,
    cashInSince,
    cashOutSince,
    cashOnHand: openingBalance + cashInSince - cashOutSince,
    expensesPaidPeriod,
    cashExpensePeriod,
  };
}
