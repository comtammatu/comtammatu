type CoverageTemplate = {
  id: number;
  name: string;
  branchName: string | null;
  isActive: boolean;
  items: Array<{ id?: number; taskKind: string }>;
};

type CoveragePosition = {
  id: number;
  code: string;
  label_vi: string | null;
  default_checklist_template_id: number | null;
};

type CoverageEmployee = {
  id: number;
  employee_code: string | null;
  is_active: boolean;
  default_checklist_template_id: number | null;
  profiles: {
    full_name: string;
    positions: {
      code: string | null;
      label_vi: string | null;
      default_checklist_template_id: number | null;
    } | null;
    branches: { name: string } | null;
  } | null;
};

type CoverageDefault = {
  templateItemId: number;
};

export type ChecklistCoverageStatus =
  | "missing_checklist"
  | "missing_consumption_defaults"
  | "custom_checklist"
  | "ok";

export interface PositionChecklistCoverageRow {
  id: number;
  positionName: string;
  checklistName: string | null;
  employeeCount: number;
  hasConsumption: boolean;
  status: ChecklistCoverageStatus;
}

export interface EmployeeChecklistCoverageIssueRow {
  id: number;
  employeeName: string;
  employeeCode: string | null;
  branchName: string | null;
  positionName: string;
  checklistName: string | null;
  status: ChecklistCoverageStatus;
}

interface BuildChecklistCoverageInput {
  employees: CoverageEmployee[];
  positions: CoveragePosition[];
  templates: CoverageTemplate[];
  consumptionDefaults: CoverageDefault[];
}

const STATUS_RANK: Record<ChecklistCoverageStatus, number> = {
  missing_checklist: 0,
  missing_consumption_defaults: 1,
  custom_checklist: 2,
  ok: 3,
};

export function buildChecklistCoverage({
  employees,
  positions,
  templates,
  consumptionDefaults,
}: BuildChecklistCoverageInput) {
  const activeEmployees = employees.filter((employee) => employee.is_active);
  const templateById = new Map(
    templates
      .filter((template) => template.isActive)
      .map((template) => [template.id, template]),
  );
  const defaultItemIds = new Set(
    consumptionDefaults.map((item) => item.templateItemId),
  );
  const consumptionItemIdsByTemplate = new Map<number, number[]>();

  for (const template of templates) {
    const itemIds = template.items.flatMap((item) =>
      item.taskKind === "consumption_report" && item.id != null
        ? [item.id]
        : [],
    );
    if (itemIds.length > 0) {
      consumptionItemIdsByTemplate.set(template.id, itemIds);
    }
  }

  const positionByCode = new Map(
    positions.map((position) => [position.code, position]),
  );
  const employeeCountByPosition = new Map<string, number>();
  for (const employee of activeEmployees) {
    const code = employee.profiles?.positions?.code;
    if (code) {
      employeeCountByPosition.set(
        code,
        (employeeCountByPosition.get(code) ?? 0) + 1,
      );
    }
  }

  function hasConsumption(templateId: number | null) {
    return templateId != null && consumptionItemIdsByTemplate.has(templateId);
  }

  function hasConsumptionDefaults(templateId: number | null) {
    if (!hasConsumption(templateId) || templateId == null) return true;
    return (consumptionItemIdsByTemplate.get(templateId) ?? []).some((id) =>
      defaultItemIds.has(id),
    );
  }

  function statusFor(templateId: number | null): ChecklistCoverageStatus {
    if (templateId == null || !templateById.has(templateId)) {
      return "missing_checklist";
    }
    if (!hasConsumptionDefaults(templateId)) {
      return "missing_consumption_defaults";
    }
    return "ok";
  }

  function sortByStatusThenName<
    T extends { status: ChecklistCoverageStatus; positionName?: string },
  >(left: T, right: T) {
    const rank = STATUS_RANK[left.status] - STATUS_RANK[right.status];
    if (rank !== 0) return rank;
    return (left.positionName ?? "").localeCompare(
      right.positionName ?? "",
      "vi",
    );
  }

  const positionsCoverage = positions
    .map<PositionChecklistCoverageRow>((position) => {
      const templateId = position.default_checklist_template_id;
      const template = templateId == null ? null : templateById.get(templateId);
      return {
        id: position.id,
        positionName: position.label_vi ?? position.code,
        checklistName: template?.name ?? null,
        employeeCount: employeeCountByPosition.get(position.code) ?? 0,
        hasConsumption: hasConsumption(templateId),
        status: statusFor(templateId),
      };
    })
    .sort(sortByStatusThenName);

  const employeeIssues = activeEmployees
    .flatMap<EmployeeChecklistCoverageIssueRow>((employee) => {
      const position = employee.profiles?.positions;
      const positionCode = position?.code;
      const positionDefaultTemplateId =
        (positionCode ? positionByCode.get(positionCode) : undefined)
          ?.default_checklist_template_id ??
        position?.default_checklist_template_id ??
        null;
      const ownTemplateId = employee.default_checklist_template_id;
      const effectiveTemplateId = ownTemplateId ?? positionDefaultTemplateId;
      const baseStatus = statusFor(effectiveTemplateId);
      const status =
        baseStatus === "ok" &&
        ownTemplateId != null &&
        positionDefaultTemplateId != null &&
        ownTemplateId !== positionDefaultTemplateId
          ? "custom_checklist"
          : baseStatus;

      if (status === "ok") return [];

      return [
        {
          id: employee.id,
          employeeName: employee.profiles?.full_name ?? "",
          employeeCode: employee.employee_code,
          branchName: employee.profiles?.branches?.name ?? null,
          positionName: position?.label_vi ?? position?.code ?? "",
          checklistName:
            effectiveTemplateId == null
              ? null
              : (templateById.get(effectiveTemplateId)?.name ?? null),
          status,
        },
      ];
    })
    .sort((left, right) => {
      const rank = sortByStatusThenName(left, right);
      if (rank !== 0) return rank;
      const branch = (left.branchName ?? "").localeCompare(
        right.branchName ?? "",
        "vi",
      );
      if (branch !== 0) return branch;
      return left.employeeName.localeCompare(right.employeeName, "vi");
    });

  return { positionsCoverage, employeeIssues };
}
