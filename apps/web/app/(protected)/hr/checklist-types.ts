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

export interface ChecklistTemplateItem {
  id?: number;
  title: string;
  phase: ChecklistPhase;
  doneDefinition: string;
  isRequired: boolean;
  sortOrder: number;
}

export interface ChecklistTemplateRow {
  id: number;
  name: string;
  branchId: number | null;
  branchName: string | null;
  isActive: boolean;
  items: ChecklistTemplateItem[];
  itemCount: number;
}

export interface ChecklistTemplateOption {
  id: number;
  name: string;
  branchId: number | null;
  label: string;
}

export function checklistTemplateLabel(
  template: Pick<ChecklistTemplateRow, "name" | "branchName" | "branchId">,
) {
  return template.branchId == null
    ? `${template.name} · Global`
    : `${template.name} · ${template.branchName ?? "Chi nhánh"}`;
}

export function checklistTemplateOptionsForBranch(
  templates: ChecklistTemplateRow[],
  branchId: number | null,
): ChecklistTemplateOption[] {
  return templates
    .filter(
      (template) =>
        template.isActive &&
        (template.branchId == null ||
          (branchId != null && template.branchId === branchId)),
    )
    .map((template) => ({
      id: template.id,
      name: template.name,
      branchId: template.branchId,
      label: checklistTemplateLabel(template),
    }));
}
