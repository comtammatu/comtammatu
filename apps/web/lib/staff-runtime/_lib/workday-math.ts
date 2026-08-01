/** Fallback when attendance rows lack a frozen scheduled window (pre-roster). */
export const WORKDAY_PER_COMPLETED_SHIFT = 0.5;

export function countCompletedShiftWorkdays(
  completedShiftCount: number,
): number {
  return Math.max(0, completedShiftCount) * WORKDAY_PER_COMPLETED_SHIFT;
}

function toEpochMs(value: string | Date): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/** Hour-ratio công; mirrors SQL `attendance_shift_workdays`. */
export function countShiftWorkdaysFromOverlap(input: {
  checkIn: string | Date;
  checkOut: string | Date;
  scheduledStart: string | Date;
  scheduledEnd: string | Date;
}): number {
  const checkIn = toEpochMs(input.checkIn);
  const checkOut = toEpochMs(input.checkOut);
  const scheduledStart = toEpochMs(input.scheduledStart);
  const scheduledEnd = toEpochMs(input.scheduledEnd);

  if (
    !Number.isFinite(checkIn) ||
    !Number.isFinite(checkOut) ||
    !Number.isFinite(scheduledStart) ||
    !Number.isFinite(scheduledEnd) ||
    checkOut <= checkIn ||
    scheduledEnd <= scheduledStart
  ) {
    return 0;
  }

  const overlapStart = Math.max(checkIn, scheduledStart);
  const overlapEnd = Math.min(checkOut, scheduledEnd);
  if (overlapEnd <= overlapStart) {
    return 0;
  }

  const workedSeconds = (overlapEnd - overlapStart) / 1000;
  const shiftSeconds = (scheduledEnd - scheduledStart) / 1000;
  if (shiftSeconds <= 0) {
    return 0;
  }

  const rounded = Math.round((workedSeconds / shiftSeconds) * 10) / 10;
  return Math.min(1, rounded);
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
