"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR scheduling surface keeps Vietnamese operational copy inline */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  addVNDateDays,
  formatVNShortBusinessDate,
  getVNDateString,
  getVNMonthEndDateString,
  getVNWeekStartDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";
import { cn } from "@comtammatu/ui/lib/utils";
import { fetchShifts } from "./actions";
import {
  bulkAssignShifts,
  bulkDeleteFutureAssignments,
  copyPreviousWeekAssignments,
  fetchEmployeesForBranch,
  fetchShiftAssignments,
  updateShiftAssignment,
  type BulkAssignmentMode,
  type BulkAssignmentResult,
} from "./shift-assignment-actions";
import type { BranchOption, ShiftRow } from "./page";
import {
  checklistTemplateOptionsForBranch,
  type ChecklistTemplateRow,
} from "./checklist-types";

interface AssignmentRow {
  id: number;
  date: string;
  branch_id: number;
  employee_id: number;
  shift_id: number;
  checklist_template_id: number | null;
  shifts: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
  shift_checklist_templates: {
    id: number;
    name: string;
    branch_id: number | null;
  } | null;
  employees: {
    id: number;
    employee_code: string | null;
    profiles: {
      full_name: string;
      positions: { label_vi: string | null } | null;
    } | null;
  } | null;
}

interface BranchEmployee {
  id: number;
  employee_code: string | null;
  default_checklist_template_id: number | null;
  profiles: {
    full_name: string;
    branch_id: number | null;
    positions: { label_vi: string | null } | null;
  } | null;
}

type ViewMode = "by_shift" | "by_employee";
type RangePreset = "this_week" | "next_week" | "two_weeks" | "month" | "custom";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" },
] as const;

const ALL_WEEKDAYS = WEEKDAY_OPTIONS.map((day) => day.value);
const WEEKDAY_GROUPS = [
  { label: "T2-T6", values: [1, 2, 3, 4, 5] },
  { label: "T7-CN", values: [6, 0] },
  { label: "Tất cả", values: ALL_WEEKDAYS },
] as const;

function employeeName(employee: BranchEmployee | AssignmentRow["employees"]) {
  return employee?.profiles?.full_name?.trim() || employee?.employee_code || "—";
}

function employeePositionLabel(
  employee: BranchEmployee | AssignmentRow["employees"],
) {
  return employee?.profiles?.positions?.label_vi ?? "Chưa có chức vụ";
}

function shiftLabel(shift: Pick<ShiftRow, "name" | "start_time" | "end_time">) {
  return `${shift.name} · ${shift.start_time.slice(0, 5)}-${shift.end_time.slice(
    0,
    5,
  )}`;
}

function getWeekday(date: string): number {
  const parts = parseISODateParts(date);
  if (!parts) return 1;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 5)).getUTCDay();
}

function buildDateRange(start: string, end: string): string[] {
  if (end < start) return [];
  const dates: string[] = [];
  let current = start;
  for (let index = 0; index < 62 && current <= end; index += 1) {
    dates.push(current);
    current = addVNDateDays(current, 1);
  }
  return dates;
}

function currentMonthRange() {
  const parts = parseISODateParts(getVNDateString());
  if (!parts) {
    const today = getVNDateString();
    return { start: today, end: today };
  }
  return {
    start: `${parts.year}-${String(parts.month).padStart(2, "0")}-01`,
    end: getVNMonthEndDateString(parts.year, parts.month),
  };
}

function rangeForPreset(preset: RangePreset, customStart: string, customEnd: string) {
  const today = getVNDateString();
  const thisWeek = getVNWeekStartDateString(today);
  if (preset === "this_week") {
    return { start: thisWeek, end: addVNDateDays(thisWeek, 6) };
  }
  if (preset === "next_week") {
    const start = addVNDateDays(thisWeek, 7);
    return { start, end: addVNDateDays(start, 6) };
  }
  if (preset === "two_weeks") {
    return { start: thisWeek, end: addVNDateDays(thisWeek, 13) };
  }
  if (preset === "month") {
    return currentMonthRange();
  }
  return { start: customStart, end: customEnd };
}

function resultToast(result: BulkAssignmentResult) {
  const parts = [
    `${result.created} tạo mới`,
    `${result.replaced} ghi đè`,
    `${result.skipped} bỏ qua`,
  ];
  if (result.invalidEmployeeIds.length > 0) {
    parts.push(`${result.invalidEmployeeIds.length} nhân viên không hợp lệ`);
  }
  if (result.invalidDates.length > 0) {
    parts.push(`${result.invalidDates.length} ngày không hợp lệ`);
  }
  return parts.join(" · ");
}

export function ShiftAssignmentsTable({
  branches,
  checklistTemplates,
}: {
  branches: BranchOption[];
  checklistTemplates: ChecklistTemplateRow[];
}) {
  const initialBranchId = branches[0]?.id ?? null;
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    initialBranchId,
  );
  const [weekStart, setWeekStart] = useState(() => getVNWeekStartDateString());
  const [viewMode, setViewMode] = useState<ViewMode>("by_shift");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [employees, setEmployees] = useState<BranchEmployee[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>("this_week");
  const [customStart, setCustomStart] = useState(getVNDateString());
  const [customEnd, setCustomEnd] = useState(addVNDateDays(getVNDateString(), 6));
  const [bulkShiftId, setBulkShiftId] = useState<string>("");
  const [bulkChecklistTemplateId, setBulkChecklistTemplateId] =
    useState("default");
  const [bulkMode, setBulkMode] =
    useState<BulkAssignmentMode>("skip_existing");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4, 5]),
  );
  const [editTarget, setEditTarget] = useState<AssignmentRow | null>(null);
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editShiftId, setEditShiftId] = useState("");
  const [editChecklistTemplateId, setEditChecklistTemplateId] =
    useState("default");
  const [editDate, setEditDate] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const today = getVNDateString();
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addVNDateDays(weekStart, index)),
    [weekStart],
  );

  const activeShifts = useMemo(
    () => shifts.filter((shift) => shift.is_active),
    [shifts],
  );

  const checklistOptions = useMemo(
    () => checklistTemplateOptionsForBranch(checklistTemplates, selectedBranchId),
    [checklistTemplates, selectedBranchId],
  );

  const visibleShifts = useMemo(() => {
    const usedShiftIds = new Set(assignments.map((item) => item.shift_id));
    return shifts.filter((shift) => shift.is_active || usedShiftIds.has(shift.id));
  }, [assignments, shifts]);

  const assignmentByEmployeeDate = useMemo(() => {
    const map = new Map<string, AssignmentRow>();
    for (const assignment of assignments) {
      map.set(`${assignment.employee_id}:${assignment.date}`, assignment);
    }
    return map;
  }, [assignments]);

  const assignmentsByShiftDate = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const assignment of assignments) {
      const key = `${assignment.shift_id}:${assignment.date}`;
      const rows = map.get(key) ?? [];
      rows.push(assignment);
      map.set(key, rows);
    }
    return map;
  }, [assignments]);

  const visibleEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) => {
      const name = employeeName(employee).toLowerCase();
      const code = employee.employee_code?.toLowerCase() ?? "";
      const positionLabel = employeePositionLabel(employee).toLowerCase();
      return name.includes(q) || code.includes(q) || positionLabel.includes(q);
    });
  }, [employeeQuery, employees]);

  const bulkRange = useMemo(
    () => rangeForPreset(rangePreset, customStart, customEnd),
    [customEnd, customStart, rangePreset],
  );

  const bulkDates = useMemo(
    () =>
      buildDateRange(bulkRange.start, bulkRange.end).filter((date) =>
        selectedWeekdays.has(getWeekday(date)),
      ),
    [bulkRange.end, bulkRange.start, selectedWeekdays],
  );

  const bulkPreview = useMemo(() => {
    const employeeIds = Array.from(selectedEmployeeIds);
    let existing = 0;
    let todayRows = 0;
    for (const employeeId of employeeIds) {
      for (const date of bulkDates) {
        if (!assignmentByEmployeeDate.has(`${employeeId}:${date}`)) continue;
        existing += 1;
        if (date <= today) todayRows += 1;
      }
    }
    const requested = employeeIds.length * bulkDates.length;
    const invalidDates = bulkDates.filter((date) => date < today).length;
    const skipped =
      bulkMode === "skip_existing" ? existing : todayRows + invalidDates;
    const replaced =
      bulkMode === "replace_future" ? Math.max(existing - todayRows, 0) : 0;
    const created = Math.max(requested - existing - invalidDates, 0);
    return { requested, created, replaced, skipped, invalidDates };
  }, [
    assignmentByEmployeeDate,
    bulkDates,
    bulkMode,
    selectedEmployeeIds,
    today,
  ]);

  const selectedFutureIds = useMemo(() => {
    const ids = new Set<number>();
    for (const assignment of assignments) {
      if (
        selectedAssignmentIds.has(assignment.id) &&
        assignment.date > today
      ) {
        ids.add(assignment.id);
      }
    }
    return ids;
  }, [assignments, selectedAssignmentIds, today]);

  const loadData = useCallback((branchId: number, targetWeekStart: string) => {
    startTransition(async () => {
      const [assignmentResult, employeeResult, shiftResult] = await Promise.all([
        fetchShiftAssignments({ branchId, weekStartDate: targetWeekStart }),
        fetchEmployeesForBranch({ branchId }),
        fetchShifts({ branchId }),
      ]);

      if (assignmentResult.success) {
        setAssignments((assignmentResult.data as AssignmentRow[]) ?? []);
      } else {
        toast.error(assignmentResult.error ?? "Không thể tải lịch phân ca.");
      }

      if (employeeResult.success) {
        const rows = (employeeResult.data as BranchEmployee[]) ?? [];
        setEmployees(rows);
        setSelectedEmployeeIds(new Set(rows.map((employee) => employee.id)));
      } else {
        toast.error(employeeResult.error ?? "Không thể tải nhân viên.");
      }

      if (shiftResult.success) {
        const rows = (shiftResult.data as ShiftRow[]) ?? [];
        setShifts(rows);
        setBulkShiftId((current) => current || rows[0]?.id.toString() || "");
      } else {
        toast.error(shiftResult.error ?? "Không thể tải ca làm.");
      }

      setSelectedAssignmentIds(new Set());
    });
  }, []);

  useEffect(() => {
    if (selectedBranchId !== null) {
      loadData(selectedBranchId, weekStart);
    }
  }, [loadData, selectedBranchId, weekStart]);

  function handleBranchChange(value: string) {
    setSelectedBranchId(Number(value));
  }

  function handleWeekMove(days: number) {
    setWeekStart((current) => addVNDateDays(current, days));
  }

  function toggleAssignment(id: number, checked: boolean) {
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleEmployee(id: number, checked: boolean) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleVisibleEmployees(checked: boolean) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      for (const employee of visibleEmployees) {
        if (checked) next.add(employee.id);
        else next.delete(employee.id);
      }
      return next;
    });
  }

  function setWeekdayGroup(values: readonly number[]) {
    setSelectedWeekdays(new Set(values));
  }

  function toggleWeekday(day: number, checked: boolean) {
    setSelectedWeekdays((prev) => {
      const next = new Set(prev);
      if (checked) next.add(day);
      else next.delete(day);
      return next;
    });
  }

  function openEdit(assignment: AssignmentRow) {
    setEditTarget(assignment);
    setEditEmployeeId(assignment.employee_id.toString());
    setEditShiftId(assignment.shift_id.toString());
    setEditChecklistTemplateId(
      assignment.checklist_template_id?.toString() ?? "default",
    );
    setEditDate(assignment.date);
  }

  function closeEdit() {
    setEditTarget(null);
    setEditEmployeeId("");
    setEditShiftId("");
    setEditChecklistTemplateId("default");
    setEditDate("");
  }

  function handleBulkAssign() {
    if (selectedBranchId === null) return;
    const shiftId = Number(bulkShiftId);
    const employeeIds = Array.from(selectedEmployeeIds);
    if (!shiftId || employeeIds.length === 0 || bulkDates.length === 0) {
      toast.error("Chọn ca, nhân viên và ngày cần phân ca.");
      return;
    }

    startTransition(async () => {
      const result = await bulkAssignShifts({
        branchId: selectedBranchId,
        shiftId,
        employeeIds,
        dates: bulkDates,
        mode: bulkMode,
        checklistTemplateId:
          bulkChecklistTemplateId === "default"
            ? null
            : Number(bulkChecklistTemplateId),
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể phân ca hàng loạt.");
        return;
      }
      toast.success(resultToast(result.data as BulkAssignmentResult));
      setBulkOpen(false);
      loadData(selectedBranchId, weekStart);
    });
  }

  function handleCopyPreviousWeek() {
    if (selectedBranchId === null) return;
    startTransition(async () => {
      const result = await copyPreviousWeekAssignments({
        branchId: selectedBranchId,
        sourceWeekStartDate: addVNDateDays(weekStart, -7),
        targetWeekStartDate: weekStart,
        mode: "skip_existing",
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể copy tuần trước.");
        return;
      }
      toast.success(resultToast(result.data as BulkAssignmentResult));
      loadData(selectedBranchId, weekStart);
    });
  }

  function handleDeleteSelected() {
    if (selectedBranchId === null || selectedFutureIds.size === 0) return;
    startTransition(async () => {
      const result = await bulkDeleteFutureAssignments({
        branchId: selectedBranchId,
        assignmentIds: Array.from(selectedFutureIds),
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa phân ca đã chọn.");
        return;
      }
      const data = result.data as { deleted: number; skipped: number };
      toast.success(`${data.deleted} phân ca đã xóa · ${data.skipped} bỏ qua`);
      setDeleteOpen(false);
      loadData(selectedBranchId, weekStart);
    });
  }

  function handleSaveEdit() {
    if (selectedBranchId === null || !editTarget) return;
    const employeeId = Number(editEmployeeId);
    const shiftId = Number(editShiftId);
    if (!employeeId || !shiftId || !editDate) {
      toast.error("Chọn đủ nhân viên, ca và ngày.");
      return;
    }

    startTransition(async () => {
      const result = await updateShiftAssignment({
        assignmentId: editTarget.id,
        branchId: selectedBranchId,
        employeeId,
        shiftId,
        date: editDate,
        checklistTemplateId:
          editChecklistTemplateId === "default"
            ? null
            : Number(editChecklistTemplateId),
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể sửa phân ca.");
        return;
      }
      const row = result.data as AssignmentRow;
      setAssignments((prev) =>
        prev.map((assignment) => (assignment.id === row.id ? row : assignment)),
      );
      toast.success("Đã cập nhật phân ca.");
      closeEdit();
    });
  }

  const visibleSelectedCount = visibleEmployees.filter((employee) =>
    selectedEmployeeIds.has(employee.id),
  ).length;
  const visibleAllSelected =
    visibleEmployees.length > 0 && visibleSelectedCount === visibleEmployees.length;
  const visibleSomeSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < visibleEmployees.length;

  if (branches.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Chưa có chi nhánh hoạt động để phân ca.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={handleBranchChange}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id.toString()}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleWeekMove(-7)}
              aria-label="Tuần trước"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-w-44 justify-start"
              onClick={() => setWeekStart(getVNWeekStartDateString())}
            >
              <CalendarDays className="mr-2 size-4" />
              {formatVNShortBusinessDate(weekStart)}-
              {formatVNShortBusinessDate(addVNDateDays(weekStart, 6))}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleWeekMove(7)}
              aria-label="Tuần sau"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === "by_shift" || value === "by_employee") {
                setViewMode(value);
              }
            }}
          >
            <ToggleGroupItem value="by_shift" aria-label="Xem theo ca">
              Theo ca
            </ToggleGroupItem>
            <ToggleGroupItem value="by_employee" aria-label="Xem theo nhân viên">
              Theo nhân viên
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPending ? <Spinner className="size-4" /> : null}
          <Button
            type="button"
            variant="outline"
            disabled={isPending || selectedBranchId === null}
            onClick={handleCopyPreviousWeek}
          >
            <Copy className="mr-2 size-4" />
            Copy tuần trước
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={selectedFutureIds.size === 0 || isPending}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 size-4" />
            Xóa đã chọn
          </Button>
          <Button
            type="button"
            disabled={selectedBranchId === null || isPending}
            onClick={() => setBulkOpen(true)}
          >
            <Plus className="mr-2 size-4" />
            Phân ca hàng loạt
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        {viewMode === "by_shift" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">Ca làm</TableHead>
                {weekDates.map((date) => (
                  <TableHead key={date} className="min-w-44">
                    <div className="flex flex-col">
                      <span>
                        {
                          WEEKDAY_OPTIONS.find(
                            (weekday) => weekday.value === getWeekday(date),
                          )?.label
                        }
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {formatVNShortBusinessDate(date)}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleShifts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={weekDates.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Chưa có ca làm. Tạo ca trước khi phân ca.
                  </TableCell>
                </TableRow>
              ) : (
                visibleShifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{shift.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {shift.start_time.slice(0, 5)}-
                        {shift.end_time.slice(0, 5)}
                      </div>
                      {!shift.is_active ? (
                        <Badge variant="outline" className="mt-2">
                          Ngưng dùng
                        </Badge>
                      ) : null}
                    </TableCell>
                    {weekDates.map((date) => {
                      const rows =
                        assignmentsByShiftDate.get(`${shift.id}:${date}`) ?? [];
                      return (
                        <TableCell key={date} className="align-top">
                          <AssignmentCell
                            assignments={rows}
                            isFutureDate={date > today}
                            selectedIds={selectedAssignmentIds}
                            onToggle={toggleAssignment}
                            onEdit={openEdit}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Nhân viên</TableHead>
                {weekDates.map((date) => (
                  <TableHead key={date} className="min-w-40">
                    <div className="flex flex-col">
                      <span>
                        {
                          WEEKDAY_OPTIONS.find(
                            (weekday) => weekday.value === getWeekday(date),
                          )?.label
                        }
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {formatVNShortBusinessDate(date)}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={weekDates.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Chi nhánh này chưa có nhân viên đang hoạt động.
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{employeeName(employee)}</div>
                      <div className="text-xs text-muted-foreground">
                        {employee.employee_code ?? "Chưa có mã"} ·{" "}
                        {employeePositionLabel(employee)}
                      </div>
                    </TableCell>
                    {weekDates.map((date) => {
                      const assignment = assignmentByEmployeeDate.get(
                        `${employee.id}:${date}`,
                      );
                      return (
                        <TableCell key={date} className="align-top">
                          {assignment ? (
                            <AssignmentCell
                              assignments={[assignment]}
                              isFutureDate={date > today}
                              selectedIds={selectedAssignmentIds}
                              onToggle={toggleAssignment}
                              onEdit={openEdit}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Trống
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={bulkOpen} onOpenChange={setBulkOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-2xl">
          <SheetHeader className="border-b px-6 pb-4">
            <SheetTitle>Phân ca hàng loạt</SheetTitle>
            <SheetDescription>
              Chọn một ca, nhiều nhân viên và nhiều ngày để tạo lịch trong một
              lần.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="bulk-shift">Ca làm</Label>
                <Select value={bulkShiftId} onValueChange={setBulkShiftId}>
                  <SelectTrigger id="bulk-shift">
                    <SelectValue placeholder="Chọn ca" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeShifts.map((shift) => (
                      <SelectItem key={shift.id} value={shift.id.toString()}>
                        {shiftLabel(shift)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-mode">Xử lý trùng</Label>
                <Select
                  value={bulkMode}
                  onValueChange={(value) =>
                    setBulkMode(
                      value === "replace_future"
                        ? "replace_future"
                        : "skip_existing",
                    )
                  }
                >
                  <SelectTrigger id="bulk-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip_existing">
                      Bỏ qua phân ca đã có
                    </SelectItem>
                    <SelectItem value="replace_future">
                      Ghi đè phân ca trong tương lai
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-checklist">Checklist override</Label>
                <Select
                  value={bulkChecklistTemplateId}
                  onValueChange={setBulkChecklistTemplateId}
                >
                  <SelectTrigger id="bulk-checklist">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Theo mặc định</SelectItem>
                    {checklistOptions.map((template) => (
                      <SelectItem
                        key={template.id}
                        value={template.id.toString()}
                      >
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Khoảng ngày</Label>
              <Select
                value={rangePreset}
                onValueChange={(value) => setRangePreset(value as RangePreset)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">Tuần này</SelectItem>
                  <SelectItem value="next_week">Tuần sau</SelectItem>
                  <SelectItem value="two_weeks">2 tuần</SelectItem>
                  <SelectItem value="month">Tháng này</SelectItem>
                  <SelectItem value="custom">Tùy chọn</SelectItem>
                </SelectContent>
              </Select>

              {rangePreset === "custom" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="custom-start">Từ ngày</Label>
                    <Input
                      id="custom-start"
                      type="date"
                      value={customStart}
                      onChange={(event) => setCustomStart(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-end">Đến ngày</Label>
                    <Input
                      id="custom-end"
                      type="date"
                      value={customEnd}
                      onChange={(event) => setCustomEnd(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {WEEKDAY_GROUPS.map((group) => (
                  <Button
                    key={group.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setWeekdayGroup(group.values)}
                  >
                    {group.label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {WEEKDAY_OPTIONS.map((weekday) => (
                  <label
                    key={weekday.value}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedWeekdays.has(weekday.value)}
                      onCheckedChange={(checked) =>
                        toggleWeekday(weekday.value, checked === true)
                      }
                    />
                    {weekday.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="employee-query">Nhân viên</Label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={
                      visibleAllSelected
                        ? true
                        : visibleSomeSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) =>
                      toggleVisibleEmployees(checked === true)
                    }
                  />
                  Chọn kết quả lọc
                </label>
              </div>
              <Input
                id="employee-query"
                value={employeeQuery}
                onChange={(event) => setEmployeeQuery(event.target.value)}
                placeholder="Tìm theo tên, mã hoặc vai trò"
              />
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {visibleEmployees.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Không có nhân viên phù hợp.
                  </div>
                ) : (
                  visibleEmployees.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                    >
                      <Checkbox
                        checked={selectedEmployeeIds.has(employee.id)}
                        onCheckedChange={(checked) =>
                          toggleEmployee(employee.id, checked === true)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {employeeName(employee)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {employee.employee_code ?? "Chưa có mã"} ·{" "}
                          {employeePositionLabel(employee)}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-5">
              <PreviewStat label="Dòng" value={bulkPreview.requested} />
              <PreviewStat label="Tạo mới" value={bulkPreview.created} />
              <PreviewStat label="Ghi đè" value={bulkPreview.replaced} />
              <PreviewStat label="Bỏ qua" value={bulkPreview.skipped} />
              <PreviewStat
                label="Ngày lỗi"
                value={bulkPreview.invalidDates}
                danger={bulkPreview.invalidDates > 0}
              />
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={isPending || bulkPreview.requested === 0}
              onClick={handleBulkAssign}
            >
              {isPending ? <Spinner className="mr-2 size-4" /> : null}
              Lưu phân ca
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa nhanh phân ca</DialogTitle>
            <DialogDescription>
              Chỉ sửa được lịch tương lai; ngày đã chấm công cần đối soát ở Ngày
              công.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-employee">Nhân viên</Label>
              <Select value={editEmployeeId} onValueChange={setEditEmployeeId}>
                <SelectTrigger id="edit-employee">
                  <SelectValue placeholder="Chọn nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id.toString()}>
                      {employeeName(employee)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-shift">Ca</Label>
              <Select value={editShiftId} onValueChange={setEditShiftId}>
                <SelectTrigger id="edit-shift">
                  <SelectValue placeholder="Chọn ca" />
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id.toString()}>
                      {shiftLabel(shift)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-checklist">Checklist override</Label>
              <Select
                value={editChecklistTemplateId}
                onValueChange={setEditChecklistTemplateId}
              >
                <SelectTrigger id="edit-checklist">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Theo mặc định</SelectItem>
                  {checklistOptions.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-date">Ngày</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                min={addVNDateDays(today, 1)}
                onChange={(event) => setEditDate(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEdit}>
              Hủy
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSaveEdit}>
              {isPending ? <Spinner className="mr-2 size-4" /> : null}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa phân ca tương lai?</DialogTitle>
            <DialogDescription>
              Hệ thống chỉ xóa các phân ca sau hôm nay và không có ngày công liên
              quan.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            {selectedFutureIds.size} phân ca tương lai đang được chọn.
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || selectedFutureIds.size === 0}
              onClick={handleDeleteSelected}
            >
              {isPending ? <Spinner className="mr-2 size-4" /> : null}
              Xóa phân ca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          danger ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AssignmentCell({
  assignments,
  isFutureDate,
  selectedIds,
  onToggle,
  onEdit,
}: {
  assignments: AssignmentRow[];
  isFutureDate: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number, checked: boolean) => void;
  onEdit: (assignment: AssignmentRow) => void;
}) {
  if (assignments.length === 0) {
    return <span className="text-xs text-muted-foreground">Trống</span>;
  }

  return (
    <div className="space-y-2">
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className="rounded-md border bg-background p-2 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <Checkbox
              checked={selectedIds.has(assignment.id)}
              disabled={!isFutureDate}
              onCheckedChange={(checked) =>
                onToggle(assignment.id, checked === true)
              }
              aria-label="Chọn phân ca"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {employeeName(assignment.employees)}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {assignment.shifts
                  ? `${assignment.shifts.name} · ${assignment.shifts.start_time.slice(
                      0,
                      5,
                    )}-${assignment.shifts.end_time.slice(0, 5)}`
                  : "Ca đã xóa"}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!isFutureDate}
              onClick={() => onEdit(assignment)}
              aria-label="Sửa phân ca"
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" />
            {employeePositionLabel(assignment.employees)} ·{" "}
            {assignment.shift_checklist_templates?.name ?? "Checklist mặc định"}
          </div>
        </div>
      ))}
    </div>
  );
}
