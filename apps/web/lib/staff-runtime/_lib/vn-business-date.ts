import {
  formatVNBusinessDate,
  formatVNTime,
  getVNDateString,
} from "@comtammatu/shared/time";

export function getTodayVN(): string {
  return getVNDateString();
}

export function formatTimeVN(iso: string): string {
  return formatVNTime(iso);
}

export function formatDateVN(dateStr: string): string {
  return formatVNBusinessDate(dateStr);
}
