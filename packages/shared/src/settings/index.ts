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
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

/** Default values for settings (used when no DB row exists) */
export const SYSTEM_SETTING_DEFAULTS: Record<SystemSettingKey, string> = {
  [SYSTEM_SETTING_KEYS.VAT_RATE]: "8",
  [SYSTEM_SETTING_KEYS.SERVICE_CHARGE]: "5",
  [SYSTEM_SETTING_KEYS.CURRENCY]: "VND",
  [SYSTEM_SETTING_KEYS.STORE_PHONE]: "",
  [SYSTEM_SETTING_KEYS.STORE_EMAIL]: "",
};

/** Labels for display in settings UI */
export const SYSTEM_SETTING_LABELS: Record<SystemSettingKey, string> = {
  [SYSTEM_SETTING_KEYS.VAT_RATE]: "Thuế GTGT (%)",
  [SYSTEM_SETTING_KEYS.SERVICE_CHARGE]: "Phí dịch vụ (%)",
  [SYSTEM_SETTING_KEYS.CURRENCY]: "Đơn vị tiền tệ",
  [SYSTEM_SETTING_KEYS.STORE_PHONE]: "Số điện thoại",
  [SYSTEM_SETTING_KEYS.STORE_EMAIL]: "Email",
};
