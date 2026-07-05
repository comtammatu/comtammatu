/**
 * System settings keys — single source of truth.
 * Never hardcode key strings elsewhere.
 */
export const SYSTEM_SETTING_KEYS = {
  /** "true" | "false" — POS shows VietQR when Admin bank settings exist */
  PAYMENT_ENABLE_VIETQR: "payment_enable_vietqr",
  /** "true" | "false" — POS shows MoMo when env credentials exist */
  PAYMENT_ENABLE_MOMO: "payment_enable_momo",
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
  /** Cash-book anchor — owner-counted opening cash balance (VND integer as string). */
  CASH_OPENING_BALANCE: "cash_opening_balance",
  /** Cash-book anchor date (YYYY-MM-DD); running cash-on-hand sums cash in/out from here. */
  CASH_OPENING_DATE: "cash_opening_date",
  /** Cash-book anchor — owner-counted opening bank-account balance (VND integer as string); shares CASH_OPENING_DATE. */
  BANK_OPENING_BALANCE: "bank_opening_balance",
  /** "true" | "false" — gates the POS split/merge-bill entries; the split/merge RPCs reject when "false". */
  POS_SPLIT_MERGE_ENABLED: "pos_split_merge_enabled",
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

/** Default values for settings (used when no DB row exists) */
export const SYSTEM_SETTING_DEFAULTS: Record<SystemSettingKey, string> = {
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]: "false",
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]: "false",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX]: "QAJZRU5550 MBBMS01382716 1",
  [SYSTEM_SETTING_KEYS.CASH_OPENING_BALANCE]: "",
  [SYSTEM_SETTING_KEYS.CASH_OPENING_DATE]: "",
  [SYSTEM_SETTING_KEYS.BANK_OPENING_BALANCE]: "",
  [SYSTEM_SETTING_KEYS.POS_SPLIT_MERGE_ENABLED]: "true",
};
