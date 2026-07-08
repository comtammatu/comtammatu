import { countCompletedShiftWorkdays } from "@lib/staff-runtime/_lib/workday-math";

export interface LeaveRange {
  employeeId: number;
  startDate: string;
  endDate: string;
  leaveType: "annual" | "sick" | "unpaid" | "personal" | "other";
}

export interface AttendanceShift {
  employeeId: number;
  date: string;
  checkOut: string | null;
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

export function buildCompletedWorkdays(
  attendance: readonly AttendanceShift[],
): Map<number, number> {
  const shiftsByEmpDay = new Map<number, Map<string, number>>();

  for (const rec of attendance) {
    if (!rec.checkOut) continue;

    let days = shiftsByEmpDay.get(rec.employeeId);
    if (!days) {
      days = new Map();
      shiftsByEmpDay.set(rec.employeeId, days);
    }
    days.set(rec.date, (days.get(rec.date) ?? 0) + 1);
  }

  const workdays = new Map<number, number>();
  for (const [employeeId, days] of shiftsByEmpDay) {
    let total = 0;
    for (const count of days.values()) total += countCompletedShiftWorkdays(count);
    workdays.set(employeeId, total);
  }

  return workdays;
}

export function summarizeLeaveDays(
  leaves: readonly LeaveRange[],
  periodStart: string,
  periodEnd: string,
): Map<number, { paidLeaveDays: number; unpaidLeaveDays: number }> {
  const byEmployee = new Map<
    number,
    { paidLeaveDays: number; unpaidLeaveDays: number }
  >();

  for (const leave of leaves) {
    const days = countOverlapDays(
      leave.startDate,
      leave.endDate,
      periodStart,
      periodEnd,
    );
    if (days === 0) continue;

    const current = byEmployee.get(leave.employeeId) ?? {
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
    };
    if (leave.leaveType === "annual") {
      current.paidLeaveDays += days;
    } else {
      current.unpaidLeaveDays += days;
    }
    byEmployee.set(leave.employeeId, current);
  }

  return byEmployee;
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

export function splitAnnualLeaveByQuota(input: {
  entitlementDays: number;
  usedBeforePeriodDays: number;
  annualLeaveDaysInPeriod: number;
}): { paidLeaveDays: number; overflowLeaveDays: number } {
  const remainingDays = Math.max(
    0,
    input.entitlementDays - input.usedBeforePeriodDays,
  );
  const annualLeaveDaysInPeriod = Math.max(0, input.annualLeaveDaysInPeriod);
  const paidLeaveDays = Math.min(annualLeaveDaysInPeriod, remainingDays);

  return {
    paidLeaveDays,
    overflowLeaveDays: annualLeaveDaysInPeriod - paidLeaveDays,
  };
}

export function calculatePayableDays(input: {
  workingDays: number;
  paidLeaveDays: number;
  standardDays: number;
}): number {
  return Math.min(
    Math.max(0, input.workingDays) + Math.max(0, input.paidLeaveDays),
    Math.max(0, input.standardDays),
  );
}
