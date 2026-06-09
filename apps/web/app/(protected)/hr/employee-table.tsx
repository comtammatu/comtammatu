"use client";

import { Users as IconUsers } from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
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

import { BRANCH_VI, FORM_VI, STAFF_VI } from "@comtammatu/shared/messages";

interface EmployeeTableProps {
  employees: EmployeeRow[];
}

export function EmployeeTable({ employees }: EmployeeTableProps) {
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
            <TableHead>{FORM_VI.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 && (
            <TableEmptyStateRow
              colSpan={5}
              title="Chưa có hồ sơ nhân viên nào"
              icon={
                <IconUsers className="mx-auto size-8 text-muted-foreground" />
              }
            />
          )}
          {employees.map((emp) => (
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
                {emp.profiles?.role ? (
                  <Badge variant="secondary">{emp.profiles.role}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <Badge variant={emp.is_active ? "default" : "outline"}>
                  {emp.is_active
                    ? ACTIVE_STATE_LABELS_VI.active
                    : ACTIVE_STATE_LABELS_VI.inactive}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
