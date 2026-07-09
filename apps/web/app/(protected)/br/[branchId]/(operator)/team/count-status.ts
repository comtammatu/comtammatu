export type TeamCountStatus =
  | "not_assigned"
  | "not_submitted"
  | "submitted"
  | "approved";

export type TeamCountStatusWithChanges = TeamCountStatus | "needs_changes";

export interface TeamCountAssignmentRow {
  employee_id: number;
  location_id: number;
  ingredient_id: number;
  shift_id: number | null;
}

export interface TeamCountSlipRow {
  employee_id: number;
  location_id: number;
  status: string | null;
  shift_id: number | null;
}

interface ResolveCountStatusOptions {
  includeNeedsChanges?: boolean;
  slipsOnlyWhenUnassigned?: boolean;
}

function assignmentCellKey(
  row: Pick<TeamCountAssignmentRow, "location_id" | "ingredient_id">,
): string {
  return `${row.location_id}:${row.ingredient_id}`;
}

function statusFromLocations(
  locationIds: readonly number[],
  slipRows: readonly TeamCountSlipRow[],
  includeNeedsChanges: boolean,
): TeamCountStatusWithChanges {
  const locations = new Set(locationIds);
  if (locations.size === 0) return "not_assigned";

  let approvedCount = 0;
  let submittedCount = 0;
  let needsChangesCount = 0;

  for (const locationId of locations) {
    const status =
      slipRows.find((row) => row.location_id === locationId)?.status ?? null;
    if (!status) return "not_submitted";
    if (status === "approved") approvedCount += 1;
    else if (status === "submitted") submittedCount += 1;
    else if (status === "needs_changes") needsChangesCount += 1;
    else return "not_submitted";
  }

  if (includeNeedsChanges && needsChangesCount > 0) return "needs_changes";
  if (needsChangesCount > 0) return "not_submitted";
  if (approvedCount === locations.size) return "approved";
  if (approvedCount + submittedCount === locations.size) return "submitted";
  return "not_submitted";
}

export function getEffectiveCountAssignments(
  assignments: readonly TeamCountAssignmentRow[],
  employeeId: number,
  shiftId: number | null,
): TeamCountAssignmentRow[] {
  const shiftSpecificCells = new Set<string>();
  if (shiftId !== null) {
    for (const row of assignments) {
      if (row.shift_id === shiftId) shiftSpecificCells.add(assignmentCellKey(row));
    }
  }

  return assignments.filter((row) => {
    if (row.employee_id !== employeeId) return false;
    if (shiftId === null) return row.shift_id === null;
    return (
      row.shift_id === shiftId ||
      (row.shift_id === null && !shiftSpecificCells.has(assignmentCellKey(row)))
    );
  });
}

export function getCountSlipsForShift(
  slips: readonly TeamCountSlipRow[],
  employeeId: number,
  shiftId: number | null,
): TeamCountSlipRow[] {
  return slips.filter(
    (row) => row.employee_id === employeeId && row.shift_id === shiftId,
  );
}

export function resolveCountStatusForShift(
  assignments: readonly TeamCountAssignmentRow[],
  slips: readonly TeamCountSlipRow[],
  employeeId: number | null,
  shiftId: number | null,
  options: ResolveCountStatusOptions = {},
): TeamCountStatusWithChanges {
  if (employeeId == null) return "not_assigned";

  const effectiveAssignments = getEffectiveCountAssignments(
    assignments,
    employeeId,
    shiftId,
  );
  const shiftSlips = getCountSlipsForShift(slips, employeeId, shiftId);
  const requiredLocationIds = [
    ...new Set(effectiveAssignments.map((row) => row.location_id)),
  ];

  if (requiredLocationIds.length === 0 && options.slipsOnlyWhenUnassigned) {
    return statusFromLocations(
      shiftSlips.map((row) => row.location_id),
      shiftSlips,
      options.includeNeedsChanges ?? false,
    );
  }

  return statusFromLocations(
    requiredLocationIds,
    shiftSlips,
    options.includeNeedsChanges ?? false,
  );
}

export function resolveCountStatusFromAnySlip(
  slips: readonly TeamCountSlipRow[],
  employeeId: number | null,
  includeNeedsChanges = false,
): TeamCountStatusWithChanges {
  if (employeeId == null) return "not_assigned";
  const employeeSlips = slips.filter((row) => row.employee_id === employeeId);
  return statusFromLocations(
    employeeSlips.map((row) => row.location_id),
    employeeSlips,
    includeNeedsChanges,
  );
}
