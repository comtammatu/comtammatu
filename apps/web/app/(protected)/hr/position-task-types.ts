export const POSITION_TASK_KINDS = ["standard", "consumption_report"] as const;

export type PositionTaskKind = (typeof POSITION_TASK_KINDS)[number];

export const POSITION_TASK_APPLICABILITY = [
  "every_shift",
  "opening",
  "closing",
] as const;

export type PositionTaskApplicability =
  (typeof POSITION_TASK_APPLICABILITY)[number];

export const POSITION_TASK_PHASES = [
  "start_of_shift",
  "end_of_shift",
] as const;

export type PositionTaskPhase = (typeof POSITION_TASK_PHASES)[number];

export interface PositionTaskInput {
  title: string;
  kind: PositionTaskKind;
  applicability: PositionTaskApplicability;
  phase: PositionTaskPhase;
  isRequired: boolean;
  doneDefinition: string;
}

export interface PositionTaskRow extends PositionTaskInput {
  id: number;
  sortOrder: number;
  ingredientIds: number[];
}

export interface PositionOption {
  id: number;
  code: string;
  label: string;
}

export interface PositionTaskIngredientOption {
  id: number;
  name: string;
  unit: string;
}
