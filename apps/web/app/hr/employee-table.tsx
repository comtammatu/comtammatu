"use client";

import { Users } from "lucide-react";
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
import { formatVND } from "@comtammatu/shared/format";
import type { EmployeeRow } from "./page";
import { TableEmptyStateRow } from "../admin/components/table-empty-state-row";

const CONTRACT_LABELS: Record<string, string> = {
  probation: "Thử việc",
  fixed_term: "Có thời hạn",
  indefinite: "Không thời hạn",
};

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
            <TableHead className="hidden md:table-cell">Chi nhánh</TableHead>
            <TableHead className="hidden md:table-cell">Vai trò</TableHead>
            <TableHead className="hidden lg:table-cell">Hợp đồng</TableHead>
            <TableHead className="hidden lg:table-cell">Lương cơ bản</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 && (
            <TableEmptyStateRow
              colSpan={7}
              title="Chưa có hồ sơ nhân viên nào"
              icon={<Users className="mx-auto size-8 text-muted-foreground" />}
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
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {emp.contract_type
                  ? (CONTRACT_LABELS[emp.contract_type] ?? emp.contract_type)
                  : "—"}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {emp.base_salary !== null ? formatVND(emp.base_salary) : "—"}
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
