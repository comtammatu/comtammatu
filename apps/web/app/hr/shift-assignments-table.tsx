"use client";

import { useState, useTransition, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  fetchShiftAssignments,
  createShiftAssignment,
  deleteShiftAssignment,
  fetchEmployeesForBranch,
} from "./shift-assignment-actions";
import { fetchShifts } from "./actions";
import type { BranchOption, ShiftRow } from "./page";

/* ─── Types ─── */

interface AssignmentRow {
  id: number;
  date: string;
  employee_id: number;
  shift_id: number;
  shifts: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
}

interface BranchEmployee {
  id: number;
  employee_code: string;
  profiles: { full_name: string; branch_id: number | null } | null;
}

/* ─── Helpers ─── */

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // getDay(): 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/* ─── Component ─── */

interface ShiftAssignmentsTableProps {
  branches: BranchOption[];
}

export function ShiftAssignmentsTable({
  branches,
}: ShiftAssignmentsTableProps) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [employees, setEmployees] = useState<BranchEmployee[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number>(
    branches[0]?.id ?? 0,
  );
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogShiftId, setAddDialogShiftId] = useState<number | null>(null);
  const [addDialogDate, setAddDialogDate] = useState<string>("");
  const [addDialogEmployeeId, setAddDialogEmployeeId] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRow | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    formatDate(addDays(weekStart, i)),
  );

  const loadData = useCallback(
    (branchId: number, monday: Date) => {
      startTransition(async () => {
        const mondayStr = formatDate(monday);
        const [assignResult, shiftsResult, empResult] = await Promise.all([
          fetchShiftAssignments({ branchId, weekStartDate: mondayStr }),
          fetchShifts({ branchId }),
          fetchEmployeesForBranch({ branchId }),
        ]);

        if (assignResult.success) {
          setAssignments((assignResult.data ?? []) as AssignmentRow[]);
        } else {
          toast.error(assignResult.error ?? "Lỗi tải phân ca");
        }

        if (shiftsResult.success) {
          setShifts((shiftsResult.data ?? []) as ShiftRow[]);
        }

        if (empResult.success) {
          setEmployees((empResult.data ?? []) as BranchEmployee[]);
        }
      });
    },
    [startTransition],
  );

  function handleBranchChange(branchId: number) {
    setSelectedBranchId(branchId);
    loadData(branchId, weekStart);
  }

  function handleWeekChange(offset: number) {
    const newWeek = addDays(weekStart, offset * 7);
    setWeekStart(newWeek);
    loadData(selectedBranchId, newWeek);
  }

  function goToThisWeek() {
    const monday = getMonday(new Date());
    setWeekStart(monday);
    loadData(selectedBranchId, monday);
  }

  function openAddDialog(shiftId: number, date: string) {
    setAddDialogShiftId(shiftId);
    setAddDialogDate(date);
    setAddDialogEmployeeId("");
    setAddError(null);
    setAddDialogOpen(true);
  }

  function handleCreateAssignment() {
    if (!addDialogShiftId || !addDialogDate || !addDialogEmployeeId) return;

    startTransition(async () => {
      setAddError(null);
      const result = await createShiftAssignment({
        branchId: selectedBranchId,
        employeeId: Number(addDialogEmployeeId),
        shiftId: addDialogShiftId,
        date: addDialogDate,
      });

      if (!result.success) {
        setAddError(result.error ?? "Đã xảy ra lỗi");
        return;
      }

      toast.success("Đã phân ca thành công");
      setAssignments((prev) => [...prev, result.data as AssignmentRow]);
      setAddDialogOpen(false);
    });
  }

  function handleDeleteAssignment() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteShiftAssignment({
        assignmentId: deleteTarget.id,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa phân ca");
        return;
      }

      toast.success("Đã xóa phân ca");
      setAssignments((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    });
  }

  // Get assignments for a specific shift + date
  function getAssignmentsForCell(
    shiftId: number,
    date: string,
  ): AssignmentRow[] {
    return assignments.filter((a) => a.shift_id === shiftId && a.date === date);
  }

  const weekEndDate = formatDate(addDays(weekStart, 6));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedBranchId.toString()}
          onValueChange={(v) => handleBranchChange(Number(v))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Chọn chi nhánh" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id.toString()}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleWeekChange(-1)}
            disabled={isPending}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToThisWeek}
            disabled={isPending}
          >
            Tuần này
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleWeekChange(1)}
            disabled={isPending}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <span className="text-sm text-muted-foreground">
          {formatShortDate(formatDate(weekStart))} &ndash;{" "}
          {formatShortDate(weekEndDate)}
        </span>

        {isPending && <Loader2 className="size-4 animate-spin" />}
      </div>

      {/* Calendar Grid */}
      {shifts.length === 0 && !isPending ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <CalendarDays className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {selectedBranchId === 0
              ? "Chọn chi nhánh để xem phân ca"
              : 'Chưa có ca làm việc. Hãy tạo ca trong tab "Ca làm" trước.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Ca</TableHead>
                {weekDates.map((date, i) => (
                  <TableHead key={date} className="min-w-28 text-center">
                    <div className="font-medium">{DAY_LABELS[i]}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {formatShortDate(date)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts
                .filter((s) => s.is_active)
                .map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{shift.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {shift.start_time} - {shift.end_time}
                      </div>
                    </TableCell>
                    {weekDates.map((date) => {
                      const cellAssignments = getAssignmentsForCell(
                        shift.id,
                        date,
                      );
                      return (
                        <TableCell key={date} className="align-top">
                          <div className="flex flex-col gap-1">
                            {cellAssignments.map((a) => (
                              <div
                                key={a.id}
                                className="group flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
                              >
                                <span className="flex-1 truncate">
                                  {a.employees?.profiles?.full_name ??
                                    a.employees?.employee_code ??
                                    "—"}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:inline-flex"
                                  onClick={() => setDeleteTarget(a)}
                                  aria-label="Xóa phân ca"
                                >
                                  <X className="size-3" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              className="h-auto border-dashed py-0.5 text-muted-foreground/50 hover:border-primary hover:text-primary"
                              onClick={() => openAddDialog(shift.id, date)}
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Assignment Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân ca nhân viên</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <span className="text-muted-foreground">Ca: </span>
              <span className="font-medium">
                {shifts.find((s) => s.id === addDialogShiftId)?.name ?? "—"}
              </span>
              <span className="text-muted-foreground"> | Ngày: </span>
              <span className="font-medium">
                {addDialogDate ? formatShortDate(addDialogDate) : "—"}
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-employee">Nhân viên *</Label>
              <Select
                value={addDialogEmployeeId}
                onValueChange={setAddDialogEmployeeId}
              >
                <SelectTrigger id="assign-employee">
                  <SelectValue placeholder="Chọn nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.profiles?.full_name ?? emp.employee_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {addError && (
              <p className="text-sm text-destructive" role="alert">
                {addError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleCreateAssignment}
              disabled={isPending || !addDialogEmployeeId}
            >
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Phân ca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phân ca?</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa phân ca của{" "}
              <strong>
                {deleteTarget?.employees?.profiles?.full_name ?? "nhân viên"}
              </strong>{" "}
              ngày{" "}
              <strong>
                {deleteTarget?.date ? formatShortDate(deleteTarget.date) : ""}
              </strong>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAssignment}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
