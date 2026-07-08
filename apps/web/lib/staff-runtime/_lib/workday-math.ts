export const WORKDAY_PER_COMPLETED_SHIFT = 0.5;

export function countCompletedShiftWorkdays(
  completedShiftCount: number,
): number {
  return Math.max(0, completedShiftCount) * WORKDAY_PER_COMPLETED_SHIFT;
}

export function countInclusiveDays(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(startDay) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonth) ||
    !Number.isFinite(endDay)
  ) {
    return 0;
  }

  const startUtc = Date.UTC(startYear!, startMonth! - 1, startDay!);
  const endUtc = Date.UTC(endYear!, endMonth! - 1, endDay!);
  const days = Math.round((endUtc - startUtc) / 86_400_000) + 1;

  return days > 0 ? days : 0;
}

export function countOverlapDays(
  startDate: string,
  endDate: string,
  periodStart: string,
  periodEnd: string,
): number {
  const start = startDate > periodStart ? startDate : periodStart;
  const end = endDate < periodEnd ? endDate : periodEnd;
  return start <= end ? countInclusiveDays(start, end) : 0;
}

export function suggestAnnualLeaveEntitlement(
  startDate: string | null | undefined,
  year: number,
): number {
  if (!startDate || startDate < `${year}-01-01`) return 12;
  if (startDate > `${year}-12-31`) return 0;

  const month = Number(startDate.slice(5, 7));
  return Number.isFinite(month) ? Math.max(0, 13 - month) : 12;
}
