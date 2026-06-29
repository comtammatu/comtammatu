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
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_VALUES)[number];

/**
 * Display grouping for the expenses ledger ("gom nhóm, giữ chi tiết"): every
 * category still exists and is stored as-is; this only buckets them into
 * operating overhead vs raw-material cost for the capture form + reporting.
 * Labels live in `messages.finance.expenses.categoryGroupLabels`.
 */
export const EXPENSE_CATEGORY_GROUPS = ["operating", "materials"] as const;

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
};

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
};

export const EXPENSE_PAYMENT_METHODS = ["cash", "transfer", "unpaid"] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
