// Phase vocabulary for rendering historical attendance checklist snapshots.
// Snapshots predating the position-task redesign may still carry
// `during_shift`, so the label map keeps all three values.
export const CHECKLIST_PHASES = [
  "start_of_shift",
  "during_shift",
  "end_of_shift",
] as const;

export type ChecklistPhase = (typeof CHECKLIST_PHASES)[number];

export const CHECKLIST_PHASE_LABELS: Record<ChecklistPhase, string> = {
  start_of_shift: "Đầu ca",
  during_shift: "Trong ca",
  end_of_shift: "Cuối ca",
};
