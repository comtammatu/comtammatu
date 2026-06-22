import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";

export { formatVND };

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
        maximumFractionDigits: 3,
      });
}

export function formatDate(iso: string): string {
  return formatVNDate(iso);
}

export function formatDateTime(iso: string): string {
  return formatVNDateTime(iso);
}
