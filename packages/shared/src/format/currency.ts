/**
 * Format a number as Vietnamese Dong (VND).
 *
 * Examples:
 *   formatVND(45000)     → "45.000đ"
 *   formatVND(1250000)   → "1.250.000đ"
 *   formatVND(0)         → "0đ"
 *   formatVND(-30000)    → "-30.000đ"
 */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return "0đ";
  const rounded = Math.round(amount);
  return `${formatDecimal(rounded, 0)}đ`;
}

export function formatDecimalInputValue(
  value: number,
  maximumFractionDigits = 3,
): string {
  if (!Number.isFinite(value)) return "";
  const fractionDigits = Math.max(0, Math.trunc(maximumFractionDigits));
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [whole = "0", rawFraction] = fixed.split(".");
  const fraction = rawFraction?.replace(/0+$/, "");
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return value < 0 && normalized !== "0" ? `-${normalized}` : normalized;
}

export function formatDecimal(
  value: number,
  maximumFractionDigits = 3,
): string {
  const raw = formatDecimalInputValue(value, maximumFractionDigits);
  if (!raw) return "0";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [whole = "0", fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

export function formatQuantity(value: number): string {
  return formatDecimal(value, 3);
}

/**
 * Format an integer count with Vietnamese thousands grouping (".").
 * Uses the same manual grouping as formatVND so it never relies on the
 * vi-VN Intl locale (which the vnd-format-ssot guard forbids spreading).
 *
 * Examples:
 *   formatCount(1234) → "1.234"
 *   formatCount(59)   → "59"
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value);
  return formatDecimal(rounded, 0);
}
