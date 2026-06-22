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
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded).toString();
  const formatted = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNegative ? "-" : ""}${formatted}đ`;
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
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded).toString();
  const formatted = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNegative ? "-" : ""}${formatted}`;
}
