/**
 * Operating-expense category + payment-method value sets (D028).
 *
 * Single source for the literal values shared by the zod schema, the DB CHECK
 * constraint (mirror in 20260615140000_add_expenses_table.sql), the capture
 * form, and the list view. Vietnamese labels live in the messages layer
 * (`messages.finance.expenses.categoryLabels` / `paymentMethodLabels`).
 */

export const EXPENSE_CATEGORY_VALUES = [
  "rent",
  "utilities",
  "gas_fuel",
  "salary",
  "cogs_manual",
  "supplies",
  "repair",
  "marketing",
  "fees_tax",
  "bank_deposit",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_VALUES)[number];

/**
 * Display grouping for the expenses ledger ("gom nhóm, giữ chi tiết"): every
 * category still exists and is stored as-is; this only buckets them into
 * operating overhead vs raw-material cost for the capture form + reporting.
 * Labels live in `messages.finance.expenses.categoryGroupLabels`.
 */
export const EXPENSE_CATEGORY_GROUPS = [
  "operating",
  "materials",
  "transfer",
] as const;

export type ExpenseCategoryGroup = (typeof EXPENSE_CATEGORY_GROUPS)[number];

export const EXPENSE_CATEGORY_GROUP: Record<
  ExpenseCategory,
  ExpenseCategoryGroup
> = {
  rent: "operating",
  utilities: "operating",
  gas_fuel: "operating",
  salary: "operating",
  repair: "operating",
  supplies: "operating",
  marketing: "operating",
  fees_tax: "operating",
  other: "operating",
  cogs_manual: "materials",
  bank_deposit: "transfer",
};

export function isOperatingExpenseCategory(category: string): boolean {
  return EXPENSE_CATEGORY_GROUP[category as ExpenseCategory] === "operating";
}

export const EXPENSE_CATEGORIES_BY_GROUP: Record<
  ExpenseCategoryGroup,
  readonly ExpenseCategory[]
> = {
  operating: EXPENSE_CATEGORY_VALUES.filter(
    (c) => EXPENSE_CATEGORY_GROUP[c] === "operating",
  ),
  materials: EXPENSE_CATEGORY_VALUES.filter(
    (c) => EXPENSE_CATEGORY_GROUP[c] === "materials",
  ),
  transfer: EXPENSE_CATEGORY_VALUES.filter(
    (c) => EXPENSE_CATEGORY_GROUP[c] === "transfer",
  ),
};

/**
 * Capture / confirm values. `transfer` means paid by bank transfer (with
 * `paid_at`), not a SePay transfer-content intent.
 */
export const EXPENSE_PAYMENT_METHODS = ["cash", "transfer", "unpaid"] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const EXPENSE_PAYMENT_STATES = [
  "unpaid",
  "cash_paid",
  "transfer_paid",
  "transfer_matched",
  "transfer_needs_match",
] as const;

export type ExpensePaymentState = (typeof EXPENSE_PAYMENT_STATES)[number];

export function classifyExpensePaymentState(expense: {
  payment_method: string;
  paid_at: string | null;
  transfer_content?: string | null;
  matchedEventIds?: readonly number[];
  matchedBankTransactionIds?: readonly number[];
}): ExpensePaymentState {
  const hasBankEvidence =
    (expense.matchedEventIds?.length ?? 0) > 0 ||
    (expense.matchedBankTransactionIds?.length ?? 0) > 0;

  if (hasBankEvidence) {
    return "transfer_matched";
  }

  // SePay transfer-content intents stay actionable until cleared or matched.
  if (
    expense.transfer_content &&
    expense.payment_method === "unpaid" &&
    expense.paid_at == null
  ) {
    return "transfer_needs_match";
  }

  if (expense.payment_method === "unpaid" || expense.paid_at == null) {
    return "unpaid";
  }

  if (expense.payment_method === "transfer") {
    return "transfer_paid";
  }

  return "cash_paid";
}

/**
 * Rows the operator still owes work on: money not yet paid out, or a
 * transfer-content intent without bank evidence. Confirmed cash/transfer
 * payments are done even before optional bank reconciliation.
 */
export function expenseNeedsAction(expense: {
  payment_method: string;
  paid_at: string | null;
  transfer_content?: string | null;
  matchedEventIds?: readonly number[];
  matchedBankTransactionIds?: readonly number[];
}): boolean {
  const state = classifyExpensePaymentState(expense);
  return state === "unpaid" || state === "transfer_needs_match";
}

/**
 * Owner/Accountant may change payment method in the edit form when the row is
 * an unmatched operating expense without an open transfer-content intent.
 */
export function canCorrectExpensePaymentMethod(expense: {
  category: string;
  payment_method: string;
  paid_at: string | null;
  transfer_content?: string | null;
  matchedEventIds?: readonly number[];
  matchedBankTransactionIds?: readonly number[];
}): boolean {
  if (!isOperatingExpenseCategory(expense.category)) return false;
  if (
    (expense.matchedEventIds?.length ?? 0) > 0 ||
    (expense.matchedBankTransactionIds?.length ?? 0) > 0
  ) {
    return false;
  }
  return classifyExpensePaymentState(expense) !== "transfer_needs_match";
}

export function isExpenseVisibleForBankMatch(
  expense: {
    category: string;
    payment_method: string;
    paid_at: string | null;
    matchedEventIds: readonly number[];
    matchedBankTransactionIds?: readonly number[];
  },
  eventId: number | null,
  bankTransactionId: number | null = null,
): boolean {
  const matchedBankTransactionIds =
    expense.matchedBankTransactionIds ?? [];
  if (
    (eventId != null && expense.matchedEventIds.includes(eventId)) ||
    (bankTransactionId != null &&
      matchedBankTransactionIds.includes(bankTransactionId))
  ) {
    return true;
  }
  if (
    expense.matchedEventIds.length > 0 ||
    matchedBankTransactionIds.length > 0 ||
    !isOperatingExpenseCategory(expense.category)
  ) {
    return false;
  }

  if (expense.payment_method === "unpaid") {
    return eventId != null && expense.paid_at == null;
  }
  if (expense.payment_method === "transfer") return expense.paid_at != null;
  return false;
}
