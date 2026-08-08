import type { RosterAssignment } from "./roster-model";
import { rosterAssignmentKey } from "./roster-model";

export const EMPTY_SHIFT_VALUE = "__empty__";

export function buildAssignmentMap(
  assignments: RosterAssignment[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const assignment of assignments) {
    map.set(
      rosterAssignmentKey(assignment.employeeId, assignment.workDate),
      assignment.shiftId,
    );
  }
  return map;
}

export function buildLeaderMap(
  assignments: RosterAssignment[],
): Map<string, { assignmentId: number; isLeader: boolean }> {
  const map = new Map<string, { assignmentId: number; isLeader: boolean }>();
  for (const assignment of assignments) {
    map.set(rosterAssignmentKey(assignment.employeeId, assignment.workDate), {
      assignmentId: assignment.id,
      isLeader: assignment.isShiftLeader,
    });
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
