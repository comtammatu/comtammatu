import { shiftWorkdaysFromAttendanceRecord } from "@lib/staff-runtime/_lib/workday-math";
import { isShiftEndedForBusinessDate } from "@lib/staff-runtime/_lib/default-shift";

function hoursBetween(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const ms = Date.parse(checkOut) - Date.parse(checkIn);
  return Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0;
}

export type BranchAttendanceChecklistItem = {
  id: number;
  title: string;
  phase: string;
  done_definition: string;
  is_required: boolean;
  is_done: boolean;
  sort_order: number;
};

export type BranchAttendanceRecord = {
  id: number;
  branch_id: number | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  check_in_photo_path: string | null;
  status: string;
  note: string | null;
  checklist_template_id: number | null;
  employee_id: number;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
  shifts: { name: string; start_time: string; end_time: string } | null;
  shift_checklist_templates: { name: string } | null;
  attendance_checklist_items: BranchAttendanceChecklistItem[];
};

export type BranchAttendanceSummaryRow = {
  employee_id: number;
  employee_code: string;
  full_name: string;
  workdays: number;
  work_hours: number;
  closedShifts: number;
  openShifts: number;
};

export function isStaleOpenAttendanceRecord(
  record: Pick<
    BranchAttendanceRecord,
    "date" | "check_in" | "check_out" | "shifts"
  >,
  todayStr: string,
): boolean {
  if (!record.check_in || record.check_out) return false;
  if (!record.shifts) return record.date < todayStr;
  return isShiftEndedForBusinessDate(record.date, {
    id: 0,
    start_time: record.shifts.start_time,
    end_time: record.shifts.end_time,
  });
}

export function attendanceChecklistProgress(record: BranchAttendanceRecord) {
  const items = record.attendance_checklist_items ?? [];
  const required = items.filter((item) => item.is_required);
  return {
    total: items.length,
    done: items.filter((item) => item.is_done).length,
    requiredTotal: required.length,
    requiredDone: required.filter((item) => item.is_done).length,
  };
}

/**
 * Derive month summary rows from full-month attendance records.
 * Closed shifts contribute workdays/hours; open shifts are counted separately.
 */
export function buildBranchAttendanceMonthSummary(
  records: readonly BranchAttendanceRecord[],
): BranchAttendanceSummaryRow[] {
  const summaryMap = new Map<
    number,
    {
      employee_id: number;
      employee_code: string;
      full_name: string;
      work_hours: number;
      closedShifts: number;
      openShifts: number;
      workdays: number;
    }
  >();

  for (const record of records) {
    const empId = record.employee_id;
    let entry = summaryMap.get(empId);
    if (!entry) {
      entry = {
        employee_id: empId,
        employee_code: record.employees?.employee_code ?? "",
        full_name: record.employees?.profiles?.full_name ?? "",
        work_hours: 0,
        closedShifts: 0,
        openShifts: 0,
        workdays: 0,
      };
      summaryMap.set(empId, entry);
    }

    if (record.check_out) {
      entry.closedShifts += 1;
      entry.workdays += shiftWorkdaysFromAttendanceRecord({
        checkIn: record.check_in,
        checkOut: record.check_out,
        scheduledStart: record.scheduled_start_at,
        scheduledEnd: record.scheduled_end_at,
      });
      entry.work_hours += hoursBetween(record.check_in, record.check_out);
    } else if (record.check_in) {
      entry.openShifts += 1;
    }
  }

  return Array.from(summaryMap.values())
    .map((entry) => ({
      employee_id: entry.employee_id,
      employee_code: entry.employee_code,
      full_name: entry.full_name,
      workdays: Math.round(entry.workdays * 10) / 10,
      work_hours: Math.round(entry.work_hours * 10) / 10,
      closedShifts: entry.closedShifts,
      openShifts: entry.openShifts,
    }))
    .toSorted((left, right) =>
      left.full_name.localeCompare(right.full_name, "vi"),
    );
}

export function filterAttendanceByEmployee(
  records: readonly BranchAttendanceRecord[],
  employeeId: number,
): BranchAttendanceRecord[] {
  return records
    .filter((record) => record.employee_id === employeeId)
    .toSorted((left, right) => {
      const byDate = right.date.localeCompare(left.date);
      if (byDate !== 0) return byDate;
      const leftIn = left.check_in ?? "";
      const rightIn = right.check_in ?? "";
      return rightIn.localeCompare(leftIn);
    });
}
