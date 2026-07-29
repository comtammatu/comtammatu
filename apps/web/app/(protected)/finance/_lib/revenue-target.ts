import { getVNDateParts } from "@comtammatu/shared/time";

/** First calendar day of the VN month containing `isoDate` (YYYY-MM-DD). */
export function monthStartFromIsoDate(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** True when start/end fall in the same VN calendar month. */
export function isSingleCalendarMonth(start: string, end: string): boolean {
  return start.length >= 7 && end.length >= 7 && start.slice(0, 7) === end.slice(0, 7);
}

export function currentVnMonthStart(now: Date = new Date()): string {
  const { year, month } = getVNDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export type TargetProgressTone = "success" | "warning" | "destructive" | "neutral";

export function targetProgressTone(
  progressPct: number | null | undefined,
): TargetProgressTone {
  if (progressPct == null || !Number.isFinite(progressPct)) return "neutral";
  if (progressPct >= 100) return "success";
  if (progressPct >= 80) return "warning";
  return "destructive";
}

export function clampProgressValue(progressPct: number | null | undefined): number {
  if (progressPct == null || !Number.isFinite(progressPct)) return 0;
  return Math.max(0, Math.min(100, progressPct));
}

/** Linear pace target for day index (1-based) within a month. */
export function paceTargetAmount(
  monthlyTarget: number,
  dayIndex: number,
  daysInMonth: number,
): number {
  if (monthlyTarget <= 0 || daysInMonth <= 0 || dayIndex <= 0) return 0;
  return (monthlyTarget * Math.min(dayIndex, daysInMonth)) / daysInMonth;
}

export function daysInMonthFromStart(monthStart: string): number {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
