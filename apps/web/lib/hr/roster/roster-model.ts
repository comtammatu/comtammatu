export type RosterEmployee = {
  employeeId: number;
  fullName: string;
  employeeCode: string | null;
  positionLabel: string | null;
};

export type RosterShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};

export type RosterAssignment = {
  employeeId: number;
  workDate: string;
  shiftId: number;
};

export type RosterWeekData = {
  employees: RosterEmployee[];
  shifts: RosterShift[];
  assignments: RosterAssignment[];
};

export function rosterAssignmentKey(employeeId: number, workDate: string): string {
  return `${employeeId}:${workDate}`;
}
