"use client";

import { useState } from "react";
import { Pencil as IconPencil, Users as IconUsers } from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { formatVND } from "@comtammatu/shared/format";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import type { BranchOption, EmployeeRow } from "./_types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { EmployeeFormDialog } from "./employee-form-dialog";

import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";

interface EmployeeTableProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  canManage: boolean;
}

export function EmployeeTable({
  employees,
  branches,
  positionOptions,
  canManage,
}: EmployeeTableProps) {
  const [rows] = useState(employees);
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);

  function renderStatus(employee: EmployeeRow) {
    return (
      <Badge variant={employee.is_active ? "default" : "outline"}>
        {employee.is_active
          ? ACTIVE_STATE_LABELS_VI.active
          : ACTIVE_STATE_LABELS_VI.inactive}
      </Badge>
    );
  }

  function hasActiveContract(employee: EmployeeRow) {
    return (employee.employment_contracts ?? []).some(
      (contract) => contract.status === "active",
    );
  }

  function renderPayrollProfile(employee: EmployeeRow) {
    const salary = Number(employee.base_salary ?? 0);
    const insuranceBase = Number(employee.insurance_base_salary ?? 0);
    return (
      <div className="flex min-w-40 flex-col gap-1">
        <span className="font-mono text-sm tabular-nums">
          {salary > 0 ? formatVND(salary) : "—"}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={hasActiveContract(employee) ? "secondary" : "outline"}
          >
            {hasActiveContract(employee) ? "Có HĐ" : "Thiếu HĐ"}
          </Badge>
          <Badge variant={insuranceBase > 0 ? "secondary" : "outline"}>
            {insuranceBase > 0 ? "Có BH" : "BH 0"}
          </Badge>
        </div>
      </div>
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
    ...(canManage
      ? [
          {
            key: "payroll",
            header: "Lương / HĐ",
            render: renderPayrollProfile,
          } satisfies DataTableColumn<EmployeeRow>,
        ]
      : []),
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
                {canManage ? renderPayrollProfile(employee) : null}
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
        />
      ) : null}
    </>
  );
}
