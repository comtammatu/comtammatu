"use client";

import { useMemo, useState } from "react";
import { Pencil as IconPencil, Users as IconUsers } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@comtammatu/ui/components/button";
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
  STAFF_VI,
} from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

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
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const [search, setSearch] = useState("");
  const filteredEmployees = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("vi-VN");
    if (!normalized) return employees;
    return employees.filter((employee) =>
      [
        employee.profiles?.full_name,
        employee.employee_code,
        employee.profiles?.branches?.name,
        employee.profiles?.positions?.label_vi,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("vi-VN").includes(normalized)),
    );
  }, [employees, search]);

  function renderStatus(employee: EmployeeRow) {
    return (
      <StatusBadge
        domain="active-state"
        value={employee.is_active ? "active" : "inactive"}
      />
    );
  }

  function renderSalarySource(employee: EmployeeRow) {
    const copy = messages.hr.client.salarySource;
    if (
      (employee.employment_contracts ?? []).some(
        (contract) => contract.status === "active",
      )
    ) {
      return <Badge variant="secondary">{copy.contract}</Badge>;
    }
    if (Number(employee.base_salary ?? 0) > 0) {
      return <Badge variant="outline">{copy.employee}</Badge>;
    }
    return <Badge variant="warning">{copy.missing}</Badge>;
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
      header: STAFF_VI.long,
      render: (employee) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {employee.profiles?.full_name ?? "—"}
          </span>
          {employee.employee_code ? (
            <span className="text-xs text-muted-foreground">
              {employee.employee_code}
            </span>
          ) : null}
        </div>
      ),
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
            key: "salarySource",
            header: messages.hr.client.salarySource.header,
            render: renderSalarySource,
          } satisfies DataTableColumn<EmployeeRow>,
        ]
      : []),
    {
      key: "status",
      header: messages.hr.client.employmentStatus,
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
        data={filteredEmployees}
        getRowKey={(employee) => employee.id}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={messages.hr.client.employeeSearch}
        emptyTitle={messages.hr.client.employeeEmpty}
        emptyIcon={<IconUsers />}
        mobileCardRender={(employee) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle size="heading" className="line-clamp-none">
                {employee.profiles?.full_name ?? "—"}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {employee.employee_code ? `${employee.employee_code} · ` : ""}
                {employee.profiles?.branches?.name ?? "—"}
              </ItemDescription>
              <div className="flex flex-wrap gap-2">
                {employee.profiles?.positions?.label_vi ? (
                  <Badge variant="secondary" className="w-fit">
                    {employee.profiles.positions.label_vi}
                  </Badge>
                ) : null}
                {canManage ? renderSalarySource(employee) : null}
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
