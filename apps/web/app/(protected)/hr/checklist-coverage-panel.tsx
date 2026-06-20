"use client";

import { ClipboardCheck as IconClipboardCheck } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppSection } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import {
  buildChecklistCoverage,
  type ChecklistCoverageStatus,
  type EmployeeChecklistCoverageIssueRow,
  type PositionChecklistCoverageRow,
} from "./checklist-coverage";
import type { EmployeeRow } from "./page";
import type {
  ChecklistTemplateRow,
  ConsumptionDefaultItemRow,
  PositionDefaultRow,
} from "./checklist-types";

interface ChecklistCoveragePanelProps {
  employees: EmployeeRow[];
  positions: PositionDefaultRow[];
  templates: ChecklistTemplateRow[];
  consumptionDefaults: ConsumptionDefaultItemRow[];
}

const copy = messages.hr.client.coverage;

const statusVariant: Record<
  ChecklistCoverageStatus,
  "secondary" | "warning" | "destructive" | "success"
> = {
  missing_checklist: "destructive",
  missing_consumption_defaults: "warning",
  custom_checklist: "secondary",
  ok: "success",
};

function StatusBadge({ status }: { status: ChecklistCoverageStatus }) {
  return <Badge variant={statusVariant[status]}>{copy.status[status]}</Badge>;
}

export function ChecklistCoveragePanel({
  employees,
  positions,
  templates,
  consumptionDefaults,
}: ChecklistCoveragePanelProps) {
  const { positionsCoverage, employeeIssues } = buildChecklistCoverage({
    employees,
    positions,
    templates,
    consumptionDefaults,
  });

  const positionColumns: DataTableColumn<PositionChecklistCoverageRow>[] = [
    {
      key: "position",
      header: copy.positionTable.position,
      render: (row) => <span className="font-medium">{row.positionName}</span>,
    },
    {
      key: "checklist",
      header: copy.positionTable.checklist,
      render: (row) => row.checklistName ?? copy.none,
    },
    {
      key: "consumption",
      header: copy.positionTable.consumption,
      render: (row) => (
        <Badge variant={row.hasConsumption ? "warning" : "secondary"}>
          {row.hasConsumption ? copy.hasConsumption : copy.noConsumption}
        </Badge>
      ),
    },
    {
      key: "employees",
      header: copy.positionTable.employees,
      className: "text-right tabular-nums",
      render: (row) => copy.employeeCount(row.employeeCount),
    },
    {
      key: "status",
      header: copy.positionTable.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const employeeColumns: DataTableColumn<EmployeeChecklistCoverageIssueRow>[] = [
    {
      key: "employee",
      header: copy.employeeTable.employee,
      render: (row) => (
        <div>
          <p className="font-medium">{row.employeeName || copy.noEmployee}</p>
          {row.employeeCode ? (
            <p className="font-mono text-xs text-muted-foreground">
              {row.employeeCode}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "scope",
      header: copy.employeeTable.scope,
      render: (row) => (
        <div className="text-sm">
          <p>{row.branchName ?? copy.noBranch}</p>
          <p className="text-muted-foreground">
            {row.positionName || copy.noPosition}
          </p>
        </div>
      ),
    },
    {
      key: "checklist",
      header: copy.employeeTable.checklist,
      render: (row) => row.checklistName ?? copy.none,
    },
    {
      key: "status",
      header: copy.employeeTable.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <AppSection
      title={copy.title}
      description={copy.description}
      headerHint={copy.hint}
      icon={<IconClipboardCheck />}
      badge={{
        children: copy.issueCount(employeeIssues.length),
        variant: employeeIssues.length > 0 ? "warning" : "success",
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-heading text-sm font-semibold">
              {copy.positionTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {copy.positionDescription}
            </p>
          </div>
          <DataTable
            columns={positionColumns}
            data={positionsCoverage}
            getRowKey={(row) => row.id}
            emptyTitle={copy.emptyPositions}
            emptyIcon={<IconClipboardCheck />}
            mobileCardRender={(row) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle className="line-clamp-none text-sm font-semibold">
                    {row.positionName}
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none text-sm leading-6">
                    {row.checklistName ?? copy.none}
                  </ItemDescription>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={row.hasConsumption ? "warning" : "secondary"}>
                      {row.hasConsumption
                        ? copy.hasConsumption
                        : copy.noConsumption}
                    </Badge>
                    <StatusBadge status={row.status} />
                  </div>
                </ItemContent>
              </Item>
            )}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="font-heading text-sm font-semibold">
              {copy.employeeTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {copy.employeeDescription}
            </p>
          </div>
          <DataTable
            columns={employeeColumns}
            data={employeeIssues}
            getRowKey={(row) => row.id}
            emptyTitle={copy.emptyEmployees}
            emptyIcon={<IconClipboardCheck />}
            mobileCardRender={(row) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle className="line-clamp-none text-sm font-semibold">
                    {row.employeeName || copy.noEmployee}
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none text-sm leading-6">
                    {row.branchName ?? copy.noBranch} ·{" "}
                    {row.positionName || copy.noPosition}
                  </ItemDescription>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {row.checklistName ?? copy.none}
                    </Badge>
                    <StatusBadge status={row.status} />
                  </div>
                </ItemContent>
              </Item>
            )}
          />
        </div>
      </div>
    </AppSection>
  );
}
