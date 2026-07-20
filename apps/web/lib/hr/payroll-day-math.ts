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

function clampThroughMonth(month: number): number {
  if (!Number.isFinite(month)) return 0;
  return Math.min(12, Math.max(0, Math.trunc(month)));
}

function monthDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthEndDate(year: number, month: number): string {
  return monthDate(
    year,
    month,
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  );
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
    for (const count of days.values())
      total += countCompletedShiftWorkdays(count);
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

export function splitAnnualLeaveByQuota(input: {
  entitlementDays: number;
  usedBeforePeriodDays: number;
  monthlyLeaveDays: number;
  annualLeaveDaysInPeriod: number;
}): {
  paidLeaveDays: number;
  overflowLeaveDays: number;
  monthlyLeaveUsedDays: number;
  annualLeaveUsedDays: number;
} {
  const requestedDays = Math.max(0, input.annualLeaveDaysInPeriod);
  const monthlyLeaveUsedDays = Math.min(
    requestedDays,
    Math.max(0, input.monthlyLeaveDays),
  );
  const annualLeaveCandidateDays = Math.max(
    0,
    requestedDays - monthlyLeaveUsedDays,
  );
  const remainingDays = Math.max(
    0,
    input.entitlementDays - input.usedBeforePeriodDays,
  );
  const annualLeaveUsedDays = Math.min(annualLeaveCandidateDays, remainingDays);
  const paidLeaveDays = monthlyLeaveUsedDays + annualLeaveUsedDays;

  return {
    paidLeaveDays,
    overflowLeaveDays: requestedDays - paidLeaveDays,
    monthlyLeaveUsedDays,
    annualLeaveUsedDays,
  };
}

export function calculateAnnualLeaveUsedThroughMonth(input: {
  leaves: readonly LeaveRange[];
  entitlementDays: number;
  monthlyLeaveDays: number;
  year: number;
  throughMonth: number;
}): number {
  const throughMonth = clampThroughMonth(input.throughMonth);
  let usedAnnualDays = 0;

  for (let month = 1; month <= throughMonth; month += 1) {
    const periodStart = monthDate(input.year, month, 1);
    const periodEnd = monthEndDate(input.year, month);
    let annualLeaveDaysInPeriod = 0;

    for (const leave of input.leaves) {
      if (leave.leaveType !== "annual") continue;
      annualLeaveDaysInPeriod += countOverlapDays(
        leave.startDate,
        leave.endDate,
        periodStart,
        periodEnd,
      );
    }

    if (annualLeaveDaysInPeriod === 0) continue;

    const split = splitAnnualLeaveByQuota({
      entitlementDays: input.entitlementDays,
      usedBeforePeriodDays: usedAnnualDays,
      monthlyLeaveDays: input.monthlyLeaveDays,
      annualLeaveDaysInPeriod,
    });
    usedAnnualDays += split.annualLeaveUsedDays;
  }

  return usedAnnualDays;
}

export function calculateMonthlyLeaveUsedInMonth(input: {
  leaves: readonly LeaveRange[];
  year: number;
  month: number;
  monthlyLeaveDays: number;
}): number {
  if (input.month < 1 || input.month > 12) return 0;

  const periodStart = monthDate(input.year, input.month, 1);
  const periodEnd = monthEndDate(input.year, input.month);
  let annualLeaveDaysInPeriod = 0;

  for (const leave of input.leaves) {
    if (leave.leaveType !== "annual") continue;
    annualLeaveDaysInPeriod += countOverlapDays(
      leave.startDate,
      leave.endDate,
      periodStart,
      periodEnd,
    );
  }

  return Math.min(annualLeaveDaysInPeriod, Math.max(0, input.monthlyLeaveDays));
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
