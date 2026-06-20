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
