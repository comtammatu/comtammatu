"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR employee table keeps Vietnamese operational copy inline */

import { useState, useTransition } from "react";
import { Users as IconUsers } from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import type { EmployeeRow } from "./page";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { setEmployeeDefaultChecklist } from "./checklist-actions";
import {
  checklistTemplateOptionsForBranch,
  type ChecklistTemplateRow,
} from "./checklist-types";

import { BRANCH_VI, FORM_VI, STAFF_VI } from "@comtammatu/shared/messages";

interface EmployeeTableProps {
  employees: EmployeeRow[];
  checklistTemplates: ChecklistTemplateRow[];
}

export function EmployeeTable({
  employees,
  checklistTemplates,
}: EmployeeTableProps) {
  const [rows, setRows] = useState(employees);
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Họ tên</TableHead>
            <TableHead className="hidden sm:table-cell">Mã NV</TableHead>
            <TableHead className="hidden md:table-cell">
              {BRANCH_VI.long}
            </TableHead>
            <TableHead className="hidden md:table-cell">
              {STAFF_VI.role}
            </TableHead>
            <TableHead>Checklist mặc định</TableHead>
            <TableHead>{FORM_VI.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableEmptyStateRow
              colSpan={6}
              title="Chưa có hồ sơ nhân viên nào"
              icon={
                <IconUsers className="mx-auto size-8 text-muted-foreground" />
              }
            />
          )}
          {rows.map((emp) => {
            const options = checklistTemplateOptionsForBranch(
              checklistTemplates,
              emp.profiles?.branch_id ?? null,
            );
            const positionDefaultId =
              emp.profiles?.positions?.default_checklist_template_id ?? null;
            const positionDefaultName = positionDefaultId
              ? (checklistTemplates.find((t) => t.id === positionDefaultId)
                  ?.name ?? null)
              : null;
            const inheritedLabel = positionDefaultName
              ? `Theo vị trí: ${positionDefaultName}`
              : "Chưa gán";

            return (
              <TableRow key={emp.id}>
                <TableCell>
                  <span className="font-medium">
                    {emp.profiles?.full_name ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {emp.employee_code ?? "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {emp.profiles?.branches?.name ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {emp.profiles?.positions?.label_vi ? (
                    <Badge variant="secondary">{emp.profiles.positions.label_vi}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={emp.default_checklist_template_id?.toString() ?? "none"}
                    disabled={isPending}
                    onValueChange={(value) => updateDefaultChecklist(emp.id, value)}
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
                </TableCell>
                <TableCell>
                  <Badge variant={emp.is_active ? "default" : "outline"}>
                    {emp.is_active
                      ? ACTIVE_STATE_LABELS_VI.active
                      : ACTIVE_STATE_LABELS_VI.inactive}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
