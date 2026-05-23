import {
  formatVNBusinessDate,
  formatVNTime,
  getVNDateString,
  getVNWeekStartDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";

export function getTodayVN(): string {
  return getVNDateString();
}

export function getMondayOfWeek(date: Date): Date {
  const weekStart = getVNWeekStartDateString(date);
  const parts = parseISODateParts(weekStart);
  if (!parts) return new Date(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 5, 0, 0));
}

export function toDateStr(d: Date): string {
  return getVNDateString(d);
}

export function formatTimeVN(iso: string): string {
  return formatVNTime(iso);
}

export function formatDateVN(dateStr: string): string {
  return formatVNBusinessDate(dateStr);
}

export function formatTimeShort(time: string | null | undefined): string {
  if (!time) return "—";
  return time.slice(0, 5);
}
