import {
  addVNDateDays,
  getVNDateString,
  getVNMinutesOfDay,
  isWithinShiftWindow,
  parseClockTimeToMinutes,
} from "@comtammatu/shared/time";

export interface BranchShiftWindow {
  id: number;
  start_time: string;
  end_time: string;
  is_split?: boolean;
  start_time_2?: string | null;
  end_time_2?: string | null;
}

interface ParsedShiftWindow {
  id: number;
  startMin: number;
  endMin: number;
}

export interface ShiftAttendanceRecord {
  date: string;
  shift_id: number;
  check_out: string | null;
}

export interface ShiftAssignmentCandidate {
  workDate: string;
  shiftId: number;
  shiftName: string | null;
  startTime: string;
  endTime: string;
  isSplit?: boolean;
  startTime2?: string | null;
  endTime2?: string | null;
}

/** Floor staff may punch this many minutes before scheduled start. */
export const CLOCK_IN_EARLY_MINUTES = 60;

export type ClockInGate =
  | {
      kind: "open";
      shiftId: number;
      businessDate: string;
      shiftName: string | null;
      startTime: string;
      endTime: string;
    }
  | {
      kind: "too_early";
      shiftId: number;
      businessDate: string;
      shiftName: string | null;
      startTime: string;
      endTime: string;
      clockInFromMinutes: number;
    }
  | {
      kind: "too_late";
      shiftName: string | null;
      endTime: string;
    }
  | { kind: "unassigned" }
  | { kind: "multiple" };

function isDayShiftWindow(startMin: number, endMin: number): boolean {
  return endMin > startMin;
}

function isInClockInWindow(
  nowMinutes: number,
  startMin: number,
  endMin: number,
  earlyMinutes: number,
): boolean {
  const clockFrom = startMin - earlyMinutes;
  if (isDayShiftWindow(startMin, endMin)) {
    return nowMinutes >= clockFrom && nowMinutes < endMin;
  }
  return nowMinutes >= clockFrom || nowMinutes < endMin;
}

function isBeforeClockInWindow(
  nowMinutes: number,
  startMin: number,
  endMin: number,
  earlyMinutes: number,
): boolean {
  const clockFrom = startMin - earlyMinutes;
  if (isDayShiftWindow(startMin, endMin)) {
    return nowMinutes < clockFrom;
  }
  return nowMinutes >= endMin && nowMinutes < clockFrom;
}

function isAfterClockInWindow(
  nowMinutes: number,
  startMin: number,
  endMin: number,
): boolean {
  if (isDayShiftWindow(startMin, endMin)) {
    return nowMinutes >= endMin;
  }
  return nowMinutes >= endMin && nowMinutes < startMin;
}

export function listAssignedShiftsInWindow(
  assignments: readonly ShiftAssignmentCandidate[],
  calendarDate: string,
  nowMinutes: number,
  earlyMinutes: number = CLOCK_IN_EARLY_MINUTES,
): ShiftAssignmentCandidate[] {
  if (assignments.length === 0) return [];

  const previousDate = addVNDateDays(calendarDate, -1);
  return assignments
    .map((assignment) => {
      const startMin = parseClockTimeToMinutes(assignment.startTime);
      const endMin = parseClockTimeToMinutes(assignment.endTime);
      if (startMin === null || endMin === null) return null;

      let inWindowToday =
        assignment.workDate === calendarDate &&
        isInClockInWindow(nowMinutes, startMin, endMin, earlyMinutes);

      if (
        !inWindowToday &&
        assignment.workDate === calendarDate &&
        assignment.isSplit &&
        assignment.startTime2 &&
        assignment.endTime2
      ) {
        const startMin2 = parseClockTimeToMinutes(assignment.startTime2);
        const endMin2 = parseClockTimeToMinutes(assignment.endTime2);
        if (startMin2 !== null && endMin2 !== null) {
          inWindowToday = isInClockInWindow(
            nowMinutes,
            startMin2,
            endMin2,
            earlyMinutes,
          );
        }
      }
      const overnightYesterday =
        assignment.workDate === previousDate &&
        !isDayShiftWindow(startMin, endMin) &&
        nowMinutes < endMin;

      if (!inWindowToday && !overnightYesterday) return null;
      return assignment;
    })
    .filter((row): row is ShiftAssignmentCandidate => row !== null);
}

export function pickAssignedShiftInWindow(
  assignments: readonly ShiftAssignmentCandidate[],
  calendarDate: string,
  nowMinutes: number,
  earlyMinutes: number = CLOCK_IN_EARLY_MINUTES,
): { shiftId: number; businessDate: string; shiftName: string | null } | null {
  const eligible = listAssignedShiftsInWindow(
    assignments,
    calendarDate,
    nowMinutes,
    earlyMinutes,
  );
  if (eligible.length !== 1) return null;

  const best = eligible[0]!;
  return {
    shiftId: best.shiftId,
    businessDate: best.workDate,
    shiftName: best.shiftName,
  };
}

export function resolveClockInGate(
  assignments: readonly ShiftAssignmentCandidate[],
  calendarDate: string,
  nowMinutes: number,
  earlyMinutes: number = CLOCK_IN_EARLY_MINUTES,
): ClockInGate {
  const open = listAssignedShiftsInWindow(
    assignments,
    calendarDate,
    nowMinutes,
    earlyMinutes,
  );
  if (open.length > 1) return { kind: "multiple" };
  const current = open[0];
  if (current) {
    let startTime = current.startTime;
    let endTime = current.endTime;
    if (current.isSplit && current.startTime2 && current.endTime2) {
      const startMin2 = parseClockTimeToMinutes(current.startTime2);
      const endMin2 = parseClockTimeToMinutes(current.endTime2);
      if (
        startMin2 !== null &&
        endMin2 !== null &&
        isInClockInWindow(nowMinutes, startMin2, endMin2, earlyMinutes)
      ) {
        startTime = current.startTime2;
        endTime = current.endTime2;
      }
    }
    return {
      kind: "open",
      shiftId: current.shiftId,
      businessDate: current.workDate,
      shiftName: current.shiftName,
      startTime,
      endTime,
    };
  }

  const upcoming = assignments
    .flatMap((assignment) => {
      if (assignment.workDate !== calendarDate) return [];
      const windows: Array<{
        startMin: number;
        endMin: number;
        startTime: string;
        endTime: string;
      }> = [];

      const startMin = parseClockTimeToMinutes(assignment.startTime);
      const endMin = parseClockTimeToMinutes(assignment.endTime);
      if (startMin !== null && endMin !== null) {
        windows.push({
          startMin,
          endMin,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
        });
      }

      if (assignment.isSplit && assignment.startTime2 && assignment.endTime2) {
        const startMin2 = parseClockTimeToMinutes(assignment.startTime2);
        const endMin2 = parseClockTimeToMinutes(assignment.endTime2);
        if (startMin2 !== null && endMin2 !== null) {
          windows.push({
            startMin: startMin2,
            endMin: endMin2,
            startTime: assignment.startTime2,
            endTime: assignment.endTime2,
          });
        }
      }

      return windows
        .filter((w) =>
          isBeforeClockInWindow(nowMinutes, w.startMin, w.endMin, earlyMinutes),
        )
        .map((w) => ({
          assignment,
          startMin: w.startMin,
          startTime: w.startTime,
          endTime: w.endTime,
        }));
    })
    .sort((a, b) => a.startMin - b.startMin);

  const next = upcoming[0];
  if (next) {
    return {
      kind: "too_early",
      shiftId: next.assignment.shiftId,
      businessDate: next.assignment.workDate,
      shiftName: next.assignment.shiftName,
      startTime: next.startTime,
      endTime: next.endTime,
      clockInFromMinutes: next.startMin - earlyMinutes,
    };
  }

  const ended = assignments
    .flatMap((assignment) => {
      if (assignment.workDate !== calendarDate) return [];
      const endTime =
        assignment.isSplit && assignment.endTime2
          ? assignment.endTime2
          : assignment.endTime;
      const endMin = parseClockTimeToMinutes(endTime);
      const startMin = parseClockTimeToMinutes(assignment.startTime);
      if (startMin === null || endMin === null) return [];
      if (!isAfterClockInWindow(nowMinutes, startMin, endMin)) return [];
      return [{ assignment, endMin, endTime }];
    })
    .sort((a, b) => b.endMin - a.endMin);

  const last = ended[0];
  if (last) {
    return {
      kind: "too_late",
      shiftName: last.assignment.shiftName,
      endTime: last.endTime,
    };
  }

  return { kind: "unassigned" };
}

export function resolveShiftBusinessDate(
  shift: BranchShiftWindow,
  nowMinutes: number = getVNMinutesOfDay(),
  calendarDate: string = getVNDateString(),
): string {
  const start = parseClockTimeToMinutes(shift.start_time);
  const end = parseClockTimeToMinutes(shift.end_time);
  if (start === null || end === null || end > start) return calendarDate;
  if (nowMinutes <= end) return addVNDateDays(calendarDate, -1);
  if (nowMinutes >= start) return calendarDate;

  // Between an overnight shift's end and next start, use the nearest shift
  // instance. This mirrors default-shift selection and keeps a just-ended
  // 18:00–02:00 attendance on its start date after 02:00.
  return nowMinutes - end <= start - nowMinutes
    ? addVNDateDays(calendarDate, -1)
    : calendarDate;
}

export function resolveCurrentShiftContext(
  shifts: readonly BranchShiftWindow[],
  attendanceRecords: readonly ShiftAttendanceRecord[],
  nowMinutes: number = getVNMinutesOfDay(),
  calendarDate: string = getVNDateString(),
): { shiftId: number; businessDate: string } | null {
  const initialShiftId = resolveDefaultShiftId(shifts, nowMinutes);
  const initialShift = shifts.find((shift) => shift.id === initialShiftId);
  if (!initialShift) return null;

  const completedShiftIds = new Set(
    attendanceRecords
      .filter((record) => {
        if (!record.check_out) return false;
        const recordShift = shifts.find(
          (shift) => shift.id === record.shift_id,
        );
        return (
          recordShift !== undefined &&
          record.date ===
            resolveShiftBusinessDate(recordShift, nowMinutes, calendarDate)
        );
      })
      .map((record) => record.shift_id),
  );
  const shiftId = resolveDefaultShiftId(shifts, nowMinutes, completedShiftIds);
  const shift = shifts.find((item) => item.id === shiftId);
  return shift
    ? {
        shiftId: shift.id,
        businessDate: resolveShiftBusinessDate(shift, nowMinutes, calendarDate),
      }
    : null;
}

export function isShiftEndedForBusinessDate(
  businessDate: string,
  shift: BranchShiftWindow,
  nowMinutes: number = getVNMinutesOfDay(),
  calendarDate: string = getVNDateString(),
): boolean {
  const start = parseClockTimeToMinutes(shift.start_time);
  const end = parseClockTimeToMinutes(shift.end_time);
  if (start === null || end === null) return businessDate < calendarDate;

  const endDate = end <= start ? addVNDateDays(businessDate, 1) : businessDate;
  if (calendarDate !== endDate) return calendarDate > endDate;
  return nowMinutes >= end;
}

/**
 * Khoảng cách (phút) từ `nowMin` tới khung giờ ca. Ca qua đêm được duỗi qua
 * nửa đêm như `isWithinShiftWindow`; thử thêm `nowMin + 1440` để rạng sáng
 * vẫn so được với ca bắt đầu tối hôm trước. Trả về 0 khi đang trong ca.
 */
function distanceToShiftWindow(
  nowMin: number,
  shift: ParsedShiftWindow,
): number {
  const effectiveEnd =
    shift.endMin > shift.startMin ? shift.endMin : shift.endMin + 1440;
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of [nowMin, nowMin + 1440]) {
    if (candidate < shift.startMin) {
      best = Math.min(best, shift.startMin - candidate);
    } else if (candidate > effectiveEnd) {
      best = Math.min(best, candidate - effectiveEnd);
    } else {
      return 0;
    }
  }
  return best;
}

/**
 * Select the nearest branch shift for non-roster display contexts.
 * Attendance clock-in must resolve persisted assignments with
 * `resolveClockInGate` and must never call this fallback.
 */
export function resolveDefaultShiftId(
  shifts: readonly BranchShiftWindow[],
  nowMinutes: number = getVNMinutesOfDay(),
  completedShiftIds: ReadonlySet<number> = new Set(),
): number | null {
  const parsed: ParsedShiftWindow[] = [];
  for (const shift of shifts) {
    const startMin = parseClockTimeToMinutes(shift.start_time);
    const endMin = parseClockTimeToMinutes(shift.end_time);
    if (startMin == null || endMin == null) continue;
    parsed.push({ id: shift.id, startMin, endMin });
  }
  if (parsed.length === 0) return null;

  const ranked = parsed
    .map((shift) => ({
      shift,
      inWindow: isWithinShiftWindow(
        nowMinutes,
        shift.startMin,
        shift.endMin,
        0,
      ),
      distance: distanceToShiftWindow(nowMinutes, shift),
    }))
    .sort((a, b) => {
      if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.shift.startMin !== b.shift.startMin) {
        return a.shift.startMin - b.shift.startMin;
      }
      return a.shift.id - b.shift.id;
    });

  return (
    ranked.find((item) => !completedShiftIds.has(item.shift.id))?.shift.id ??
    ranked[0]?.shift.id ??
    null
  );
}
