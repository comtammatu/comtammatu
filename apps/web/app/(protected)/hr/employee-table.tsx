"use client";

import { useState, useTransition } from "react";
import { Pencil as IconPencil, Users as IconUsers } from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import type { BranchOption, EmployeeRow } from "./page";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { setEmployeeDefaultChecklist } from "./checklist-actions";
import {
  checklistTemplateOptionsForBranch,
  type ChecklistTemplateRow,
} from "./checklist-types";

import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";

interface EmployeeTableProps {
  employees: EmployeeRow[];
  checklistTemplates: ChecklistTemplateRow[];
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  canManage: boolean;
}

export function EmployeeTable({
  employees,
  checklistTemplates,
  branches,
  positionOptions,
  canManage,
}: EmployeeTableProps) {
  const [rows, setRows] = useState(employees);
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateDefaultChecklist(employeeId: number, value: string) {
    const templateId = value === "none" ? null : Number(value);
    setRows((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? { ...employee, default_checklist_template_id: templateId }
          : employee,
      ),
    );

    startTransition(async () => {
      const result = await setEmployeeDefaultChecklist({
        employeeId,
        templateId,
      });
      if (!result.success) {
        setRows(employees);
        toast.error(result.error ?? "Không thể cập nhật checklist mặc định.");
        return;
      }
      toast.success("Đã cập nhật checklist mặc định.");
    });
  }

  function getPositionDefaultName(employee: EmployeeRow) {
    const positionDefaultId =
      employee.profiles?.positions?.default_checklist_template_id ?? null;
    if (!positionDefaultId) return null;
    return (
      checklistTemplates.find((template) => template.id === positionDefaultId)
        ?.name ?? null
    );
  }

  function renderChecklistSelect(employee: EmployeeRow) {
    const options = checklistTemplateOptionsForBranch(
      checklistTemplates,
      employee.profiles?.branch_id ?? null,
    );
    const positionDefaultName = getPositionDefaultName(employee);
    const inheritedLabel = positionDefaultName
      ? `Theo vị trí: ${positionDefaultName}`
      : "Chưa gán";

    return (
      <Select
        value={employee.default_checklist_template_id?.toString() ?? "none"}
        disabled={isPending}
        onValueChange={(value) => updateDefaultChecklist(employee.id, value)}
      >
        <SelectTrigger className="w-full min-w-48">
          <SelectValue placeholder={inheritedLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{inheritedLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id.toString()}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  function renderStatus(employee: EmployeeRow) {
    return (
      <Badge variant={employee.is_active ? "default" : "outline"}>
        {employee.is_active
          ? ACTIVE_STATE_LABELS_VI.active
          : ACTIVE_STATE_LABELS_VI.inactive}
      </Badge>
    );
  }

  function renderEdit(employee: EmployeeRow) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditEmployee(employee)}
      >
        <IconPencil data-icon="inline-start" />
        {ACTIONS_VI.edit}
      </Button>
    );
  }

  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key: "name",
      header: "Họ tên",
      render: (employee) => (
        <span className="font-medium">
          {employee.profiles?.full_name ?? "—"}
        </span>
      ),
    },
    {
      key: "code",
      header: "Mã NV",
      className: "text-muted-foreground",
      render: (employee) => employee.employee_code ?? "—",
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-muted-foreground",
      render: (employee) => employee.profiles?.branches?.name ?? "—",
    },
    {
      key: "role",
      header: STAFF_VI.role,
      render: (employee) =>
        employee.profiles?.positions?.label_vi ? (
          <Badge variant="secondary">
            {employee.profiles.positions.label_vi}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "checklist",
      header: "Checklist mặc định",
      render: renderChecklistSelect,
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: renderStatus,
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            className: "w-20 text-right",
            render: renderEdit,
          } satisfies DataTableColumn<EmployeeRow>,
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(employee) => employee.id}
        emptyTitle="Chưa có hồ sơ nhân viên nào"
        emptyIcon={<IconUsers />}
        mobileCardRender={(employee) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {employee.profiles?.full_name ?? "—"}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {employee.employee_code ?? "—"} ·{" "}
                {employee.profiles?.branches?.name ?? "—"}
              </ItemDescription>
              <div className="flex flex-col gap-3">
                {employee.profiles?.positions?.label_vi ? (
                  <Badge variant="secondary" className="w-fit">
                    {employee.profiles.positions.label_vi}
                  </Badge>
                ) : null}
                {renderChecklistSelect(employee)}
              </div>
            </ItemContent>
            <ItemActions className="flex flex-col items-end gap-2">
              {renderStatus(employee)}
              {canManage ? renderEdit(employee) : null}
            </ItemActions>
          </Item>
        )}
      />
      {canManage ? (
        <EmployeeFormDialog
          open={!!editEmployee}
          onOpenChange={(open) => !open && setEditEmployee(null)}
          mode="edit"
          employee={editEmployee}
          branches={branches}
          positionOptions={positionOptions}
          checklistTemplates={checklistTemplates}
        />
      ) : null}
    </>
  );
}
