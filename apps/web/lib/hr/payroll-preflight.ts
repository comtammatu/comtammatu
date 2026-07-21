import { getVNDateString } from "@comtammatu/shared/time";
import { isShiftEndedForBusinessDate } from "@lib/staff-runtime/_lib/default-shift";

export type PayrollPreflightBlockerKind =
  | "missing_salary"
  | "stale_open_attendance"
  | "pending_leave";

export interface PayrollPreflightBlocker {
  kind: PayrollPreflightBlockerKind;
  count: number;
  branchId: number | null;
  branchName: string | null;
}

export interface PayrollPreflight {
  blockers: PayrollPreflightBlocker[];
}

export interface PayrollPreflightEmployee {
  employeeId: number;
  branchId: number | null;
  branchName: string | null;
}

export interface PayrollPreflightAttendance {
  employeeId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
}

interface PayrollPreflightInput {
  employees: PayrollPreflightEmployee[];
  missingSalaryEmployeeIds: number[];
  openAttendance: PayrollPreflightAttendance[];
  pendingLeaveEmployeeIds: number[];
}

interface PayrollPreflightClock {
  calendarDate?: string;
  nowMinutes?: number;
}

const BLOCKER_ORDER: Record<PayrollPreflightBlockerKind, number> = {
  missing_salary: 0,
  stale_open_attendance: 1,
  pending_leave: 2,
};

export function isStaleOpenPayrollAttendance(
  attendance: PayrollPreflightAttendance,
  { calendarDate = getVNDateString(), nowMinutes }: PayrollPreflightClock = {},
): boolean {
  if (!attendance.checkIn || attendance.checkOut) return false;
  if (!attendance.shiftStartTime || !attendance.shiftEndTime) {
    return attendance.date < calendarDate;
  }
  return isShiftEndedForBusinessDate(
    attendance.date,
    {
      id: 0,
      start_time: attendance.shiftStartTime,
      end_time: attendance.shiftEndTime,
    },
    nowMinutes,
    calendarDate,
  );
}

export function buildPayrollPreflight({
  employees,
  missingSalaryEmployeeIds,
  openAttendance,
  pendingLeaveEmployeeIds,
}: PayrollPreflightInput): PayrollPreflight {
  const employeeById = new Map(
    employees.map((employee) => [employee.employeeId, employee]),
  );
  const blockers = new Map<string, PayrollPreflightBlocker>();

  function addBlocker(kind: PayrollPreflightBlockerKind, employeeId: number) {
    const employee = employeeById.get(employeeId);
    if (!employee) return;

    const key = `${kind}:${employee.branchId ?? "none"}`;
    const current = blockers.get(key);
    if (current) {
      current.count += 1;
      return;
    }
    blockers.set(key, {
      kind,
      count: 1,
      branchId: employee.branchId,
      branchName: employee.branchName,
    });
  }

  for (const employeeId of missingSalaryEmployeeIds) {
    addBlocker("missing_salary", employeeId);
  }
  for (const attendance of openAttendance) {
    if (isStaleOpenPayrollAttendance(attendance)) {
      addBlocker("stale_open_attendance", attendance.employeeId);
    }
  }
  for (const employeeId of pendingLeaveEmployeeIds) {
    addBlocker("pending_leave", employeeId);
  }

  return {
    blockers: Array.from(blockers.values()).sort((left, right) => {
      const kindOrder = BLOCKER_ORDER[left.kind] - BLOCKER_ORDER[right.kind];
      if (kindOrder !== 0) return kindOrder;
      return (left.branchName ?? "").localeCompare(
        right.branchName ?? "",
        "vi-VN",
      );
    }),
  };
}
