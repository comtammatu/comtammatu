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

export const CHECKLIST_SCOPES = [
  "every_shift",
  "opening",
  "closing",
  "weekly",
] as const;

export type ChecklistScope = (typeof CHECKLIST_SCOPES)[number];

export const CHECKLIST_SCOPE_LABELS: Record<ChecklistScope, string> = {
  every_shift: "Mỗi ca",
  opening: "Ca mở (sáng)",
  closing: "Ca đóng (chiều)",
  weekly: "Hằng tuần",
};

export interface ChecklistTemplateItem {
  id?: number;
  title: string;
  phase: ChecklistPhase;
  scope: ChecklistScope;
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

export interface PositionDefaultRow {
  id: number;
  code: string;
  label_vi: string | null;
  default_checklist_template_id: number | null;
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
