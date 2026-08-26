import type { ScheduleAttendance } from "../schedule/data";

export interface ScheduleAssignment {
  workDate: string;
  shiftId: number | null;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
}

export function mergeScheduleAttendanceWithAssignments(
  attendance: readonly ScheduleAttendance[],
  assignments: readonly ScheduleAssignment[],
): ScheduleAttendance[] {
  const punchedKeys = new Set(
    attendance.map(
      (row) => `${row.date}:${row.shift_name ?? ""}:${row.start_time ?? ""}`,
    ),
  );
  const merged = [...attendance];
  for (const assignment of assignments) {
    if (assignment.shiftId == null) {
      merged.push({
        date: assignment.workDate,
        check_in: null,
        check_out: null,
        scheduled_start_at: null,
        scheduled_end_at: null,
        status: "day_off",
        shift_name: null,
        start_time: null,
        end_time: null,
      });
      continue;
    }
    const key = `${assignment.workDate}:${assignment.shiftName ?? ""}:${assignment.startTime ?? ""}`;
    if (punchedKeys.has(key)) continue;
    merged.push({
      date: assignment.workDate,
      check_in: null,
      check_out: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
      status: "scheduled",
      shift_name: assignment.shiftName,
      start_time: assignment.startTime,
      end_time: assignment.endTime,
    });
  }
  return merged.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.start_time ?? "").localeCompare(b.start_time ?? "");
  });
}
