"use client";

import { useState, useEffect, useCallback } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@comtammatu/ui/components/dialog";
import { ChevronLeft, ChevronRight, Plus, X, Loader2 } from "lucide-react";
import {
  fetchShiftAssignments,
  fetchShifts,
  assignShift,
  removeShiftAssignment,
} from "../actions";

interface Branch {
  id: number;
  name: string;
}

interface Employee {
  id: number;
  employee_code: string | null;
  is_active: boolean;
  profiles: { full_name: string; branch_id: number | null } | null;
}

interface ShiftOption {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface Assignment {
  id: number;
  date: string;
  employee_id: number;
  employees: {
    id: number;
    employee_code: string | null;
    profiles: { full_name: string } | null;
  } | null;
  shifts: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface Props {
  branches: Branch[];
  employees: Employee[];
  defaultBranchId?: number;
}

function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay(); // 0=Sun
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const LOCALE_DATE = (d: Date) =>
  d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

export function ShiftAssignmentsClient({
  branches,
  employees,
  defaultBranchId,
}: Props) {
  const [branchId, setBranchId] = useState<number | undefined>(
    defaultBranchId ?? branches[0]?.id,
  );
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEmployeeId, setDialogEmployeeId] = useState<number | null>(null);
  const [dialogDate, setDialogDate] = useState<string>("");
  const [dialogShiftId, setDialogShiftId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekDates = getWeekDates(weekAnchor);
  const startDate = toDateStr(weekDates[0]!);
  const endDate = toDateStr(weekDates[6]!);

  const loadData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    const [assignResult, shiftResult] = await Promise.all([
      fetchShiftAssignments({ startDate, endDate, branchId }),
      fetchShifts(branchId),
    ]);
    if (assignResult.success) {
      setAssignments((assignResult.data as Assignment[]) ?? []);
    } else {
      setError(assignResult.error ?? "Lỗi tải dữ liệu");
    }
    if (shiftResult.success) {
      setShifts((shiftResult.data as ShiftOption[]) ?? []);
    }
    setLoading(false);
  }, [branchId, startDate, endDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Map: employee_id + date → assignment
  const assignmentMap = new Map<string, Assignment>();
  for (const a of assignments) {
    assignmentMap.set(`${String(a.employee_id)}-${a.date}`, a);
  }

  // Filter employees by branch
  const branchEmployees = employees.filter(
    (e) => e.profiles?.branch_id === branchId,
  );

  function openAssignDialog(employeeId: number, date: string) {
    setDialogEmployeeId(employeeId);
    setDialogDate(date);
    setDialogShiftId("");
    setDialogOpen(true);
  }

  async function handleAssign() {
    if (!dialogEmployeeId || !dialogShiftId || !branchId) return;
    setSubmitting(true);
    const result = await assignShift({
      employeeId: dialogEmployeeId,
      shiftId: Number(dialogShiftId),
      date: dialogDate,
      branchId,
    });
    setSubmitting(false);
    if (result.success) {
      setDialogOpen(false);
      void loadData();
    } else {
      setError(result.error ?? "Không thể phân ca");
    }
  }

  async function handleRemove(assignmentId: number) {
    const result = await removeShiftAssignment(assignmentId);
    if (result.success) {
      void loadData();
    } else {
      setError(result.error ?? "Không thể xóa phân ca");
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {branches.length > 1 && (
          <Select
            value={String(branchId ?? "")}
            onValueChange={(v) => setBranchId(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const d = new Date(weekAnchor);
              d.setDate(d.getDate() - 7);
              setWeekAnchor(d);
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">
            {LOCALE_DATE(weekDates[0]!)} – {LOCALE_DATE(weekDates[6]!)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const d = new Date(weekAnchor);
              d.setDate(d.getDate() + 7);
              setWeekAnchor(d);
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Calendar table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Nhân viên
              </th>
              {weekDates.map((d, i) => (
                <th
                  key={toDateStr(d)}
                  className="px-3 py-2.5 text-center font-medium text-muted-foreground"
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="text-xs font-normal">{LOCALE_DATE(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branchEmployees.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {branchId
                    ? "Không có nhân viên nào trong chi nhánh này"
                    : "Chọn chi nhánh để xem lịch"}
                </td>
              </tr>
            ) : (
              branchEmployees.map((emp) => (
                <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {emp.profiles?.full_name ?? "—"}
                    </div>
                    {emp.employee_code && (
                      <div className="text-xs text-muted-foreground">
                        {emp.employee_code}
                      </div>
                    )}
                  </td>
                  {weekDates.map((d) => {
                    const dateStr = toDateStr(d);
                    const assignment = assignmentMap.get(
                      `${String(emp.id)}-${dateStr}`,
                    );
                    return (
                      <td key={dateStr} className="px-2 py-2 text-center">
                        {assignment ? (
                          <div className="group relative inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            <span>{assignment.shifts?.name ?? "Ca"}</span>
                            <button
                              onClick={() => void handleRemove(assignment.id)}
                              className="hidden text-destructive group-hover:inline-flex"
                              title="Xóa phân ca"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openAssignDialog(emp.id, dateStr)}
                            className="inline-flex size-7 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground opacity-0 transition-opacity hover:border-primary hover:text-primary group-hover:opacity-100 focus:opacity-100"
                            title="Phân ca"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Assign Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Phân ca làm việc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Ngày</p>
              <p className="text-sm font-medium">{dialogDate}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Nhân viên</p>
              <p className="text-sm font-medium">
                {branchEmployees.find((e) => e.id === dialogEmployeeId)
                  ?.profiles?.full_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Chọn ca</p>
              <Select value={dialogShiftId} onValueChange={setDialogShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn ca làm việc" />
                </SelectTrigger>
                <SelectContent>
                  {shifts
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.start_time}–{s.end_time})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button
              onClick={() => void handleAssign()}
              disabled={!dialogShiftId || submitting}
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Phân ca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
