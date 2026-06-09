"use client";

import { useState, useTransition } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { fetchShifts } from "./actions";
import { EmployeeTable } from "./employee-table";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { ShiftsTable } from "./shifts-table";
import { AttendanceTable } from "./attendance-table";
import { ShiftAssignmentsTable } from "./shift-assignments-table";
import type { BranchOption, EmployeeRow, ShiftRow } from "./page";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { UserPlus as IconUserPlus } from "lucide-react";

import { BRANCH_VI, STAFF_VI } from "@comtammatu/shared/messages";
interface HrClientProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  canManageEmployees: boolean;
}

export function HrClient({
  employees,
  branches,
  canManageEmployees,
}: HrClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const defaultTab = canManageEmployees ? "employees" : "assignments";

  function loadShifts(branchId: number) {
    setSelectedBranchId(branchId);
    startTransition(async () => {
      const result = await fetchShifts({ branchId });
      if (result.success) {
        setShifts((result.data as ShiftRow[]) ?? []);
      } else {
        toast.error(result.error ?? "Không thể tải ca làm việc");
      }
    });
  }

  function handleTabChange(value: string) {
    if (
      value === "shifts" &&
      selectedBranchId !== null &&
      shifts.length === 0
    ) {
      loadShifts(selectedBranchId);
    }
  }

  return (
    <Tabs defaultValue={defaultTab} onValueChange={handleTabChange}>
      <TabsList>
        {canManageEmployees ? (
          <TabsTrigger value="employees">{STAFF_VI.long}</TabsTrigger>
        ) : null}
        <TabsTrigger value="shifts">Ca</TabsTrigger>
        <TabsTrigger value="assignments">Phân ca</TabsTrigger>
        <TabsTrigger value="attendance">Ngày công</TabsTrigger>
      </TabsList>

      {canManageEmployees ? (
        <TabsContent value="employees" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {employees.length} nhân viên
            </p>
            <Button onClick={() => setAddOpen(true)}>
              <IconUserPlus className="mr-2 size-4" />
              Thêm nhân viên
            </Button>
          </div>
          <EmployeeTable employees={employees} />
          <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} />
        </TabsContent>
      ) : null}

      <TabsContent value="shifts" className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={(v) => loadShifts(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={BRANCH_VI.select} />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ShiftsTable
          shifts={shifts}
          branches={branches}
          selectedBranchId={selectedBranchId}
          isPending={isPending}
          onShiftSaved={(shift) =>
            setShifts((prev) => {
              const exists = prev.some((item) => item.id === shift.id);
              if (!exists) return [...prev, shift];
              return prev.map((item) =>
                item.id === shift.id ? { ...item, ...shift } : item,
              );
            })
          }
        />
      </TabsContent>

      <TabsContent value="assignments" className="mt-4">
        <ShiftAssignmentsTable branches={branches} />
      </TabsContent>

      <TabsContent value="attendance" className="mt-4">
        <AttendanceTable branches={branches} />
      </TabsContent>
    </Tabs>
  );
}
