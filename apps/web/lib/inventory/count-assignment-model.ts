export type CountAssignmentEmployee = {
  id: number;
  name: string;
  positionId?: number | null;
  positionCode?: string | null;
  positionName?: string | null;
  scheduledShiftIds?: number[];
};

export function isPositionMatchingStationRole(
  positionCode: string | null | undefined,
  stationRole: string | null | undefined,
): boolean {
  if (!stationRole || stationRole === "all" || stationRole === "custom") {
    return true;
  }
  if (!positionCode) return false;

  const normPos = positionCode.toLowerCase().replace(/[-_]/g, "");
  const normStation = stationRole.toLowerCase().replace(/[-_]/g, "");

  if (
    normStation.includes("cashier") ||
    normStation.includes("waiter") ||
    normStation.includes("drink")
  ) {
    return (
      normPos.includes("waiter") ||
      normPos.includes("cashier") ||
      normPos.includes("service") ||
      normPos.includes("drink")
    );
  }
  if (normStation.includes("grill")) {
    return normPos.includes("grill");
  }
  if (normStation.includes("kitchen") || normStation.includes("warehouse")) {
    return (
      normPos.includes("kitchen") ||
      normPos.includes("cook") ||
      normPos.includes("helper") ||
      normPos.includes("warehouse")
    );
  }
  return normPos.includes(normStation) || normStation.includes(normPos);
}

export type CountAssignmentIngredient = {
  id: number;
  name: string;
  unit: string;
};

export type CountAssignmentLocation = {
  id: number;
  label: string;
  kind: string | null;
};

export type CountAssignmentShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};

export type CountTemplate = {
  id: number;
  code: string;
  name: string;
  stationRole: string;
  isSystem: boolean;
  ingredientIds: number[];
};

export type StationAssignmentRow = {
  employeeId: number;
  ingredientIds: number[];
};

export type BranchCountAssignmentData = {
  branchId: number;
  branchName: string;
  selectedLocationId: number | null;
  selectedShiftId: number | null;
  locationOptions: CountAssignmentLocation[];
  shiftOptions: CountAssignmentShift[];
  employees: CountAssignmentEmployee[];
  ingredients: CountAssignmentIngredient[];
  templates: CountTemplate[];
  assignmentsByEmployee: Record<string, number[]>;
};
