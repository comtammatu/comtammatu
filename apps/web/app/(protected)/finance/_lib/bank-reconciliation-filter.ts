export const BANK_RECONCILIATION_FILTER_PARAM = "recon";
export const BANK_RECONCILIATION_FILTER_DEFAULT = "needs_review" as const;
export const BANK_RECONCILIATION_FILTER_VALUES = [
  "all",
  "needs_review",
  "money_in_review",
  "money_out_review",
  "missing_webhook",
  "matched",
  "webhook_error",
] as const;

export type BankReconciliationFilter =
  (typeof BANK_RECONCILIATION_FILTER_VALUES)[number];

export function isBankReconciliationFilter(
  value: string,
): value is BankReconciliationFilter {
  return BANK_RECONCILIATION_FILTER_VALUES.some((filter) => filter === value);
}

export function parseBankReconciliationFilter(
  value: string | null | undefined,
): BankReconciliationFilter {
  if (value && isBankReconciliationFilter(value)) return value;
  return BANK_RECONCILIATION_FILTER_DEFAULT;
}
