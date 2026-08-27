export type CountAssignmentEmployee = {
  id: number;
  name: string;
  positionId?: number | null;
  positionCode?: string | null;
  positionName?: string | null;
};

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
