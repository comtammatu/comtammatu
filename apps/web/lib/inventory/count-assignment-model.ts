export type CountAssignmentEmployee = {
  id: number;
  name: string;
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

export type BranchCountAssignmentData = {
  branchId: number;
  branchName: string;
  selectedLocationId: number | null;
  selectedShiftId: number | null;
  locationOptions: CountAssignmentLocation[];
  shiftOptions: CountAssignmentShift[];
  employees: CountAssignmentEmployee[];
  ingredients: CountAssignmentIngredient[];
  assignmentsByEmployee: Record<string, number[]>;
};
