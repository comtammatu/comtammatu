/**
 * System settings keys — single source of truth.
 * Never hardcode key strings elsewhere.
 */
export const SYSTEM_SETTING_KEYS = {
  /** "true" | "false" — POS shows VietQR when Owner bank settings exist */
  PAYMENT_ENABLE_VIETQR: "payment_enable_vietqr",
  /** Bank shortcode (e.g. "TCB", "VCB"). */
  PAYMENT_VIETQR_BANK_CODE: "payment_vietqr_bank_code",
  /** Receiving bank account number. */
  PAYMENT_VIETQR_ACCOUNT_NO: "payment_vietqr_account_no",
  /** Account holder name printed on QR. */
  PAYMENT_VIETQR_ACCOUNT_NAME: "payment_vietqr_account_name",
  /**
   * Transfer-memo fixed prefix (the MB soundbox recognition token). The stored
   * payment code is this prefix + " " + a 12-char random suffix. Uppercase
   * [A-Z0-9 ], single-spaced — the QR-memo builder and SePay webhook both
   * collapse whitespace before matching.
   */
  PAYMENT_VIETQR_CODE_PREFIX: "payment_vietqr_code_prefix",
  /** Bank transfer memo command prefix used by SePay webhook routing. */
  PAYMENT_CONTENT_PREFIX: "payment_content_prefix",
  /** Memo token for order payments after PAYMENT_CONTENT_PREFIX. */
  PAYMENT_CONTENT_ORDER_TOKEN: "payment_content_order_token",
  /** Memo token for expense-bank transaction matching after PAYMENT_CONTENT_PREFIX. */
  PAYMENT_CONTENT_EXPENSE_TOKEN: "payment_content_expense_token",
  /** Memo token for cash-to-bank deposits after PAYMENT_CONTENT_PREFIX. */
  PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN: "payment_content_cash_deposit_token",
  /** Cash-book anchor — owner-counted opening cash balance (VND integer as string). */
  CASH_OPENING_BALANCE: "cash_opening_balance",
  /** Cash-book anchor date (YYYY-MM-DD); running cash-on-hand sums cash in/out from here. */
  CASH_OPENING_DATE: "cash_opening_date",
  /** Cash-book anchor — owner-counted opening bank-account balance (VND integer as string); shares CASH_OPENING_DATE. */
  BANK_OPENING_BALANCE: "bank_opening_balance",
  /** "true" | "false" — gates the POS split/merge-bill entries; the split/merge RPCs reject when "false". */
  POS_SPLIT_MERGE_ENABLED: "pos_split_merge_enabled",
  /** Tenant-wide number of standard payable workdays in a payroll month. */
  HR_STANDARD_WORKDAYS: "hr_standard_workdays",
  /** Paid leave days allocated from the monthly leave bucket, per month. */
  HR_MONTHLY_LEAVE_DAYS: "hr_monthly_leave_days",
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

/** Default values for settings (used when no DB row exists) */
export const SYSTEM_SETTING_DEFAULTS: Record<SystemSettingKey, string> = {
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]: "false",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX]:
    "QAJZRU5550 MBBMS01382716 1",
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX]: "MATU",
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_ORDER_TOKEN]: "DON",
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN]: "CHI",
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN]: "NOP",
  [SYSTEM_SETTING_KEYS.CASH_OPENING_BALANCE]: "",
  [SYSTEM_SETTING_KEYS.CASH_OPENING_DATE]: "",
  [SYSTEM_SETTING_KEYS.BANK_OPENING_BALANCE]: "",
  [SYSTEM_SETTING_KEYS.POS_SPLIT_MERGE_ENABLED]: "true",
  [SYSTEM_SETTING_KEYS.HR_STANDARD_WORKDAYS]: "26",
  [SYSTEM_SETTING_KEYS.HR_MONTHLY_LEAVE_DAYS]: "2",
};
