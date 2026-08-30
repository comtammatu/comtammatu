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

export type ShiftGroup = "all" | "operations" | "guard";

export function isGuardShiftName(name: string): boolean {
  return /bảo vệ|guard/i.test(name);
}

export function isGuardPosition(positionLabel: string | null | undefined): boolean {
  return positionLabel != null && /bảo vệ|guard|an ninh/i.test(positionLabel);
}

export function isCashierPosition(
  positionLabel: string | null | undefined,
): boolean {
  return positionLabel != null && /thu ngân|cashier/i.test(positionLabel);
}

export function isKitchenPosition(
  positionLabel: string | null | undefined,
): boolean {
  return (
    positionLabel != null &&
    /bếp|nướng|lên món|chef|cook|grill|kitchen/i.test(positionLabel)
  );
}

export function isWaiterPosition(
  positionLabel: string | null | undefined,
): boolean {
  return (
    positionLabel != null &&
    /phục vụ|waiter|server|bàn/i.test(positionLabel)
  );
}

export function getShiftGroup(shift: RosterShift): "operations" | "guard" {
  return isGuardShiftName(shift.name) ? "guard" : "operations";
}

export type ShiftCoverageAlert =
  | "missing_cashier"
  | "missing_kitchen"
  | "missing_waiter"
  | "missing_guard";

export function getShiftCoverageAlerts(
  shift: RosterShift,
  assignedEmployees: RosterEmployee[],
): ShiftCoverageAlert[] {
  if (assignedEmployees.length === 0) return [];
  const alerts: ShiftCoverageAlert[] = [];
  const isGuard = isGuardShiftName(shift.name);

  if (isGuard) {
    const hasGuard = assignedEmployees.some((e) =>
      isGuardPosition(e.positionLabel),
    );
    if (!hasGuard) alerts.push("missing_guard");
  } else {
    const hasCashier = assignedEmployees.some((e) =>
      isCashierPosition(e.positionLabel),
    );
    const hasKitchen = assignedEmployees.some((e) =>
      isKitchenPosition(e.positionLabel),
    );
    const hasWaiter = assignedEmployees.some((e) =>
      isWaiterPosition(e.positionLabel),
    );

    if (!hasCashier) alerts.push("missing_cashier");
    if (!hasKitchen) alerts.push("missing_kitchen");
    if (!hasWaiter) alerts.push("missing_waiter");
  }

  return alerts;
}

export function matchesCoverageNeed(
  positionLabel: string | null | undefined,
  alerts: ShiftCoverageAlert[],
): boolean {
  if (!alerts.length || !positionLabel) return false;
  if (alerts.includes("missing_cashier") && isCashierPosition(positionLabel))
    return true;
  if (alerts.includes("missing_kitchen") && isKitchenPosition(positionLabel))
    return true;
  if (alerts.includes("missing_waiter") && isWaiterPosition(positionLabel))
    return true;
  if (alerts.includes("missing_guard") && isGuardPosition(positionLabel))
    return true;
  return false;
}
