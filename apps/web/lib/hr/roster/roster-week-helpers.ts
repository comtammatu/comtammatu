import type { RosterAssignment } from "./roster-model";
import { rosterAssignmentKey, rosterCellKey } from "./roster-model";

export const EMPTY_SHIFT_VALUE = "__empty__";

export function buildAssignmentMap(
  assignments: RosterAssignment[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const assignment of assignments) {
    if (assignment.shiftId == null) continue;
    const key = rosterCellKey(assignment.employeeId, assignment.workDate);
    const current = map.get(key) ?? [];
    if (!current.includes(assignment.shiftId)) {
      current.push(assignment.shiftId);
    }
    map.set(key, current);
  }
  return map;
}

export function buildLeaderMap(
  assignments: RosterAssignment[],
): Map<string, { assignmentId: number; isLeader: boolean }> {
  const map = new Map<string, { assignmentId: number; isLeader: boolean }>();
  for (const assignment of assignments) {
    if (assignment.shiftId == null) continue;
    map.set(
      rosterAssignmentKey(
        assignment.employeeId,
        assignment.workDate,
        assignment.shiftId,
      ),
      {
        assignmentId: assignment.id,
        isLeader: assignment.isShiftLeader,
      },
    );
  }
  return map;
}

export function formatShiftLabel(
  name: string,
  startTime: string,
  endTime: string,
) {
  return `${name} (${startTime.slice(0, 5)}–${endTime.slice(0, 5)})`;
}
