import {
  formatDecimal,
  formatQuantity,
  formatVND,
} from "@comtammatu/shared/format";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";

export { formatDecimal, formatVND };

export function parseOptionalNumber(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function formatQty(n: number): string {
  return formatQuantity(n);
}

export function formatDate(iso: string): string {
  return formatVNDate(iso);
}

export function formatDateTime(iso: string): string {
  return formatVNDateTime(iso);
}
