import {
  addVNDateDays,
  formatVNDate,
  formatVNDayMonth,
  formatVNWeekdayShort,
  getVNDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";

export function getVNWeekStartMonday(dateStr?: string): string {
  const base = dateStr ?? getVNDateString();
  const parts = parseISODateParts(base);
  if (!parts) return getVNDateString();

  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 5, 0, 0));
  const mondayOffset = (anchor.getUTCDay() + 6) % 7;
  return addVNDateDays(base, -mondayOffset);
}

export function getVNWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addVNDateDays(weekStart, index));
}

export function formatRosterDayHeader(dateStr: string): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return dateStr;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 5, 0, 0));
  const weekday = formatVNWeekdayShort(date);
  const dayMonth = formatVNDayMonth(date);
  return `${weekday} ${dayMonth}`;
}

export function formatRosterWeekRange(weekStart: string): string {
  const weekEnd = addVNDateDays(weekStart, 6);
  const startParts = parseISODateParts(weekStart);
  const endParts = parseISODateParts(weekEnd);
  if (!startParts || !endParts) return weekStart;

  const startDate = new Date(
    Date.UTC(startParts.year, startParts.month - 1, startParts.day, 5, 0, 0),
  );
  const endDate = new Date(
    Date.UTC(endParts.year, endParts.month - 1, endParts.day, 5, 0, 0),
  );
  const startLabel = formatVNDayMonth(startDate);
  const endLabel = formatVNDate(endDate);
  return `${startLabel} – ${endLabel}`;
}
