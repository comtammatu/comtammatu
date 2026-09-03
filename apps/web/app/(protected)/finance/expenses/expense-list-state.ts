/**
 * Route-local list state for the operating-expense ledger.
 *
 * The eight shared Finance params (`_lib/finance-params.ts`) govern period and
 * scope; the filters below are owned by this list URL only, per the
 * record-depth contract ("List URL owns filters").
 */

import { matchesSearch } from "@lib/search";
import {
  EXPENSE_CATEGORY_VALUES,
  expenseNeedsAction,
  isExpenseLedgerCategory,
  isOperatingExpenseCategory,
  isStartupCapitalCategory,
  type ExpenseCategory,
} from "../_lib/expense-categories";

export const EXPENSE_LIST_STATE_FILTERS = ["pending"] as const;

export type ExpenseListStateFilter =
  (typeof EXPENSE_LIST_STATE_FILTERS)[number];

export const EXPENSE_LIST_STATE_PARAM = "state";
export const EXPENSE_LIST_QUERY_PARAM = "q";
export const EXPENSE_LIST_KIND_PARAM = "kind";

export const EXPENSE_LIST_KIND_GROUPS = ["operating", "startup"] as const;

export type ExpenseListKindFilter =
  | (typeof EXPENSE_LIST_KIND_GROUPS)[number]
  | ExpenseCategory;

export type ExpenseListFilters = {
  state: ExpenseListStateFilter | null;
  query: string;
  kind: ExpenseListKindFilter | null;
};

export type ExpenseListRowMatch = {
  category: string;
  note: string | null;
  vendor_name: string | null;
  transfer_content?: string | null;
  payment_method: string;
  paid_at: string | null;
  matchedEventIds?: readonly number[];
  matchedBankTransactionIds?: readonly number[];
};

function firstSearchValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseExpenseListState(
  value: string | string[] | undefined,
): ExpenseListStateFilter | null {
  const first = firstSearchValue(value);
  return (EXPENSE_LIST_STATE_FILTERS as readonly string[]).includes(first ?? "")
    ? "pending"
    : null;
}

export function parseExpenseListQuery(
  value: string | string[] | undefined,
): string {
  return (firstSearchValue(value) ?? "").trim();
}

export function parseExpenseListKind(
  value: string | string[] | undefined,
): ExpenseListKindFilter | null {
  const first = firstSearchValue(value);
  if (first === "operating" || first === "startup") return first;
  if (
    first != null &&
    (EXPENSE_CATEGORY_VALUES as readonly string[]).includes(first) &&
    isExpenseLedgerCategory(first)
  ) {
    return first as ExpenseCategory;
  }
  return null;
}

export function parseExpenseListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ExpenseListFilters {
  return {
    state: parseExpenseListState(searchParams[EXPENSE_LIST_STATE_PARAM]),
    query: parseExpenseListQuery(searchParams[EXPENSE_LIST_QUERY_PARAM]),
    kind: parseExpenseListKind(searchParams[EXPENSE_LIST_KIND_PARAM]),
  };
}

export function expenseRowMatchesKind(
  row: Pick<ExpenseListRowMatch, "category">,
  kind: ExpenseListKindFilter | null,
): boolean {
  if (kind == null) return true;
  if (kind === "operating") return isOperatingExpenseCategory(row.category);
  if (kind === "startup") return isStartupCapitalCategory(row.category);
  return row.category === kind;
}

export function expenseRowMatchesQuery(
  row: Pick<ExpenseListRowMatch, "note" | "vendor_name" | "transfer_content" | "category">,
  query: string,
  categoryLabel?: (category: string) => string,
): boolean {
  if (!query.trim()) return true;
  return matchesSearch(
    [
      row.note,
      row.vendor_name,
      row.transfer_content,
      categoryLabel?.(row.category) ?? row.category,
    ],
    query,
  );
}

export function filterExpenseRows<T extends ExpenseListRowMatch>(
  rows: readonly T[],
  filters: ExpenseListFilters,
  options?: {
    categoryLabel?: (category: string) => string;
    ignoreKind?: boolean;
  },
): T[] {
  return rows.filter((row) => {
    if (filters.state === "pending" && !expenseNeedsAction(row)) return false;
    if (!options?.ignoreKind && !expenseRowMatchesKind(row, filters.kind)) {
      return false;
    }
    return expenseRowMatchesQuery(row, filters.query, options?.categoryLabel);
  });
}
