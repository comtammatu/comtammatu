/**
 * Route-local list state for the operating-expense ledger.
 *
 * The eight shared Finance params (`_lib/finance-params.ts`) govern period and
 * scope; the triage filter below is owned by this list URL only, per the
 * record-depth contract ("List URL owns filters").
 */

export const EXPENSE_LIST_STATE_FILTERS = ["pending"] as const;

export type ExpenseListStateFilter =
  (typeof EXPENSE_LIST_STATE_FILTERS)[number];

export const EXPENSE_LIST_STATE_PARAM = "state";

export function parseExpenseListState(
  value: string | string[] | undefined,
): ExpenseListStateFilter | null {
  const first = Array.isArray(value) ? value[0] : value;
  return (EXPENSE_LIST_STATE_FILTERS as readonly string[]).includes(first ?? "")
    ? "pending"
    : null;
}
