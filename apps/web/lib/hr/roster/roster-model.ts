export type RosterEmployee = {
  employeeId: number;
  fullName: string;
  employeeCode: string | null;
  positionLabel: string | null;
  startDate: string | null;
};

export type RosterShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};

export type RosterAssignment = {
  id: number;
  employeeId: number;
  workDate: string;
  shiftId: number;
  isShiftLeader: boolean;
};

export const ROSTER_WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type RosterWeekdayKey = (typeof ROSTER_WEEKDAY_KEYS)[number];

export type EmployeeWeeklySchedule = {
  employeeId: number;
  effectiveFrom: string;
  shiftsByDay: Record<RosterWeekdayKey, number | null>;
};

export type RosterWeekData = {
  employees: RosterEmployee[];
  shifts: RosterShift[];
  assignments: RosterAssignment[];
  weeklySchedules: EmployeeWeeklySchedule[];
};

export function rosterCellKey(employeeId: number, workDate: string): string {
  return `${employeeId}:${workDate}`;
}

export function rosterAssignmentKey(
  employeeId: number,
  workDate: string,
  shiftId: number,
): string {
  return `${employeeId}:${workDate}:${shiftId}`;
}

/** @deprecated Use rosterCellKey or rosterAssignmentKey for multi-shift roster. */
export function rosterDayKey(employeeId: number, workDate: string): string {
  return rosterCellKey(employeeId, workDate);
}
