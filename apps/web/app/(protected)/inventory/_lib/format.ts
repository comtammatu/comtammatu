import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";

export { formatVND };

/**
 * Compact VND display that returns the placeholder dash for null/0 values.
 * Use on read-only cells where a sea of "0đ" is alarm-fatigue noise; the
 * dash makes "no data yet" visually distinct from "actually zero" without
 * regressing alignment (still uses tabular-nums in the wrapper).
 */
export function formatVndCompactOrDash(
  n: number | null | undefined,
  dash = "—",
): string {
  if (n == null || n === 0) return dash;
  return formatVND(n);
}

export function parseOptionalNumber(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function formatQty(n: number): string {
  return n % 1 === 0
    ? n.toLocaleString("vi-VN")
    : n.toLocaleString("vi-VN", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}

export function formatDate(iso: string): string {
  return formatVNDate(iso);
}

export function formatDateTime(iso: string): string {
  return formatVNDateTime(iso);
}
