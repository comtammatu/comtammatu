/**
 * System settings keys — single source of truth.
 * Never hardcode key strings elsewhere.
 */
export const SYSTEM_SETTING_KEYS = {
  VAT_RATE: "vat_rate",
  SERVICE_CHARGE: "service_charge",
  CURRENCY: "currency",
  STORE_PHONE: "store_phone",
  STORE_EMAIL: "store_email",
  /** "true" | "false" — POS shows VietQR when env credentials exist */
  PAYMENT_ENABLE_VIETQR: "payment_enable_vietqr",
  /** "true" | "false" — POS shows MoMo when env credentials exist */
  PAYMENT_ENABLE_MOMO: "payment_enable_momo",
  /** Bank shortcode (e.g. "TCB", "VCB"). Per-tenant override of VIETQR_BANK_ID env. */
  PAYMENT_VIETQR_BANK_CODE: "payment_vietqr_bank_code",
  /** Receiving bank account number. Per-tenant override of VIETQR_ACCOUNT_NO env. */
  PAYMENT_VIETQR_ACCOUNT_NO: "payment_vietqr_account_no",
  /** Account holder name printed on QR. Per-tenant override of VIETQR_ACCOUNT_NAME env. */
  PAYMENT_VIETQR_ACCOUNT_NAME: "payment_vietqr_account_name",
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

/** Keys edited on Admin → Settings → Chung (excludes payment toggles) */
export const GENERAL_SYSTEM_SETTING_KEYS = [
  SYSTEM_SETTING_KEYS.VAT_RATE,
  SYSTEM_SETTING_KEYS.SERVICE_CHARGE,
  SYSTEM_SETTING_KEYS.CURRENCY,
  SYSTEM_SETTING_KEYS.STORE_PHONE,
  SYSTEM_SETTING_KEYS.STORE_EMAIL,
] as const satisfies readonly SystemSettingKey[];

export type GeneralSystemSettingKey =
  (typeof GENERAL_SYSTEM_SETTING_KEYS)[number];

/** Default values for settings (used when no DB row exists) */
export const SYSTEM_SETTING_DEFAULTS: Record<SystemSettingKey, string> = {
  [SYSTEM_SETTING_KEYS.VAT_RATE]: "8",
  [SYSTEM_SETTING_KEYS.SERVICE_CHARGE]: "5",
  [SYSTEM_SETTING_KEYS.CURRENCY]: "VND",
  [SYSTEM_SETTING_KEYS.STORE_PHONE]: "",
  [SYSTEM_SETTING_KEYS.STORE_EMAIL]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]: "false",
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]: "false",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: "",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: "",
};

/** Labels for display in settings UI */
export const SYSTEM_SETTING_LABELS: Record<SystemSettingKey, string> = {
  [SYSTEM_SETTING_KEYS.VAT_RATE]: "Thuế GTGT (%)",
  [SYSTEM_SETTING_KEYS.SERVICE_CHARGE]: "Phí dịch vụ (%)",
  [SYSTEM_SETTING_KEYS.CURRENCY]: "Đơn vị tiền tệ",
  [SYSTEM_SETTING_KEYS.STORE_PHONE]: "Số điện thoại",
  [SYSTEM_SETTING_KEYS.STORE_EMAIL]: "Email",
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]: "Bật VietQR trên POS",
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]: "Bật MoMo trên POS",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: "Ngân hàng (VietQR)",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: "Số tài khoản (VietQR)",
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: "Chủ tài khoản (VietQR)",
};
