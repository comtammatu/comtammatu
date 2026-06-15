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

export const EXPENSE_PAYMENT_METHODS = ["cash", "transfer", "unpaid"] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
