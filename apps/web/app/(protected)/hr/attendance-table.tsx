"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR attendance checklist detail copy is local to this manager review surface */

import Image from "next/image";
import { useState, useTransition } from "react";
import { Image as IconImage } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  BRANCH_VI,
  ERRORS_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import {
  getVNMonthSequenceBack,
  getVNMonthString,
  formatVNTime,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  fetchAttendance,
  fetchAttendanceSummary,
  getAttendancePhotoUrl,
} from "./actions";
import { fetchApprovedLeaveMonth } from "./leave-request-actions";
import type { BranchOption } from "./page";
import {
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_PHASES,
  type ChecklistPhase,
} from "./checklist-types";

const attendanceCopy = messages.employee.hrAttendance;

interface AttendanceRecord {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_photo_path: string | null;
  status: string;
  note: string | null;
  checklist_template_id: number | null;
  employee_id: number;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
  shifts: { name: string; start_time: string; end_time: string } | null;
  shift_checklist_templates: { name: string } | null;
  attendance_checklist_items: {
    id: number;
    title: string;
    phase: string;
    done_definition: string;
    is_required: boolean;
    is_done: boolean;
    sort_order: number;
  }[];
}

interface AttendanceSummaryRow {
  employee_id: number;
  employee_code: string;
  full_name: string;
  present: number;
  late: number;
  absent: number;
  half_day: number;
  total: number;
}

interface ApprovedLeaveRow {
  id: number;
  start_date: string;
  end_date: string;
  leave_type: string;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  present: attendanceCopy.present,
  late: attendanceCopy.late,
  absent: attendanceCopy.absent,
  half_day: attendanceCopy.halfDay,
};

const STATUS_COLORS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  present: "default",
  late: "outline",
  absent: "destructive",
  half_day: "secondary",
};

interface AttendanceTableProps {
  branches: BranchOption[];
}

export function AttendanceTable({ branches }: AttendanceTableProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
  const [leaves, setLeaves] = useState<ApprovedLeaveRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<number>(
    branches[0]?.id ?? 0,
  );
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return getVNMonthString();
  });
  const [view, setView] = useState<"clock" | "summary">("summary");
  const [isPending, startTransition] = useTransition();

  function loadData(branchId: number, month: string) {
    setSelectedBranch(branchId);
    setSelectedMonth(month);
    startTransition(async () => {
      const [viewResult, leaveResult] = await Promise.all([
        view === "summary"
          ? fetchAttendanceSummary({ branchId, month })
          : fetchAttendance({ branchId, month }),
        fetchApprovedLeaveMonth({ branchId, month }),
      ]);

      if (viewResult.success) {
        if (view === "summary") {
          setSummary((viewResult.data ?? []) as AttendanceSummaryRow[]);
        } else {
          setRecords((viewResult.data ?? []) as AttendanceRecord[]);
        }
      } else {
        toast.error(viewResult.error ?? ERRORS_VI.fallback);
      }

      if (leaveResult.success) {
        setLeaves((leaveResult.data ?? []) as ApprovedLeaveRow[]);
      } else {
        setLeaves([]);
      }
    });
  }

  // Generate month options (last 6 months)
  const monthOptions = getVNMonthSequenceBack(6).map(({ date }) =>
    date.slice(0, 7),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedBranch.toString()}
          onValueChange={(v) => loadData(Number(v), selectedMonth)}
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

        <Select
          value={selectedMonth}
          onValueChange={(v) => loadData(selectedBranch, v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            variant={view === "summary" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView("summary");
              loadData(selectedBranch, selectedMonth);
            }}
          >
            {attendanceCopy.summaryView}
          </Button>
          <Button
            variant={view === "clock" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView("clock");
              loadData(selectedBranch, selectedMonth);
            }}
          >
            {attendanceCopy.clockView}
          </Button>
        </div>

        {isPending && <Spinner />}
      </div>

      {view === "summary" ? (
        <SummaryView data={summary} />
      ) : (
        <DetailView data={records} />
      )}

      <ApprovedLeavePanel leaves={leaves} />
    </div>
  );
}

function formatLeaveDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function ApprovedLeavePanel({ leaves }: { leaves: ApprovedLeaveRow[] }) {
  if (leaves.length === 0) return null;

  const leaveCopy = messages.hr.leave;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{attendanceCopy.leaveTitle}</p>
        <Badge variant="info">{attendanceCopy.leaveCount(leaves.length)}</Badge>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{attendanceCopy.employeeCode}</TableHead>
              <TableHead>{attendanceCopy.fullName}</TableHead>
              <TableHead>{attendanceCopy.leaveRange}</TableHead>
              <TableHead>{attendanceCopy.leaveType}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaves.map((leave) => {
              const typeLabel =
                leaveCopy.types[
                  leave.leave_type as keyof typeof leaveCopy.types
                ] ?? leaveCopy.types.other;
              return (
                <TableRow key={leave.id}>
                  <TableCell className="font-mono">
                    {leave.employees?.employee_code ?? "—"}
                  </TableCell>
                  <TableCell>
                    {leave.employees?.profiles?.full_name ??
                      leaveCopy.fallbackEmployee}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {leave.start_date === leave.end_date
                      ? formatLeaveDate(leave.start_date)
                      : `${formatLeaveDate(leave.start_date)} - ${formatLeaveDate(leave.end_date)}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{typeLabel}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryView({ data }: { data: AttendanceSummaryRow[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {attendanceCopy.loadHint}
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{attendanceCopy.employeeCode}</TableHead>
            <TableHead>{attendanceCopy.fullName}</TableHead>
            <TableHead className="text-center">
              {attendanceCopy.present}
            </TableHead>
            <TableHead className="text-center">{attendanceCopy.late}</TableHead>
            <TableHead className="text-center">
              {attendanceCopy.absent}
            </TableHead>
            <TableHead className="text-center">
              {attendanceCopy.halfDay}
            </TableHead>
            <TableHead className="text-center">{FORM_VI.total}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.employee_id}>
              <TableCell className="font-mono">{row.employee_code}</TableCell>
              <TableCell>{row.full_name}</TableCell>
              <TableCell className="text-center font-medium text-success">
                {row.present}
              </TableCell>
              <TableCell className="text-center font-medium text-warning-foreground">
                {row.late}
              </TableCell>
              <TableCell className="text-center font-medium text-destructive">
                {row.absent}
              </TableCell>
              <TableCell className="text-center font-medium text-info">
                {row.half_day}
              </TableCell>
              <TableCell className="text-center font-bold">
                {row.total}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailView({
  data,
}: {
  data: AttendanceRecord[];
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [checklistRecord, setChecklistRecord] =
    useState<AttendanceRecord | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    employeeName: string;
    date: string;
  } | null>(null);
  const [pendingPhotoId, setPendingPhotoId] = useState<number | null>(null);
  const [, startPhotoTransition] = useTransition();

  function openPhoto(record: AttendanceRecord) {
    if (!record.check_in_photo_path) return;

    setPendingPhotoId(record.id);
    startPhotoTransition(async () => {
      const result = await getAttendancePhotoUrl({
        attendanceId: record.id,
      });
      setPendingPhotoId(null);

      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? attendanceCopy.photoLoadError);
        return;
      }

      setPhotoPreview({
        url: result.data.url,
        employeeName: record.employees?.profiles?.full_name ?? STAFF_VI.long,
        date: record.date,
      });
      setPhotoOpen(true);
    });
  }

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {attendanceCopy.empty}
      </p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{FORM_VI.date}</TableHead>
              <TableHead>{STAFF_VI.long}</TableHead>
              <TableHead>{attendanceCopy.shift}</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>{attendanceCopy.checkIn}</TableHead>
              <TableHead>{attendanceCopy.checkOut}</TableHead>
              <TableHead>{attendanceCopy.recordState}</TableHead>
              <TableHead>{attendanceCopy.photo}</TableHead>
              <TableHead>{FORM_VI.notes}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((record) => {
              const photoPending = pendingPhotoId === record.id;
              return (
                <TableRow key={record.id}>
                  <TableCell className="font-mono text-sm">
                    {record.date}
                  </TableCell>
                  <TableCell>
                    {record.employees?.profiles?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {record.shifts?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {record.shift_checklist_templates?.name ?? (
                      <span className="text-muted-foreground">Chưa gán</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ChecklistProgressButton
                      record={record}
                      onOpen={() => setChecklistRecord(record)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {record.check_in ? formatVNTime(record.check_in) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {record.check_out ? formatVNTime(record.check_out) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[record.status] ?? "secondary"}>
                      {record.check_out
                        ? attendanceCopy.checkedOut
                        : record.check_in
                          ? attendanceCopy.inShift
                          : (STATUS_LABELS[record.status] ?? record.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {record.check_in_photo_path ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pendingPhotoId !== null}
                        onClick={() => openPhoto(record)}
                      >
                        {photoPending ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <IconImage data-icon="inline-start" />
                        )}
                        {attendanceCopy.viewPhoto}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {attendanceCopy.noPhoto}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                    {record.note ?? ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={photoOpen}
        onOpenChange={(open) => {
          setPhotoOpen(open);
          if (!open) setPhotoPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{attendanceCopy.photoDialogTitle}</DialogTitle>
            <DialogDescription>
              {attendanceCopy.photoDialogDescription}
            </DialogDescription>
          </DialogHeader>
          {photoPreview ? (
            <Image
              src={photoPreview.url}
              alt={attendanceCopy.photoAlt(
                photoPreview.employeeName,
                photoPreview.date,
              )}
              width={960}
              height={720}
              className="h-auto max-h-dvh-80 w-full rounded-md object-contain"
              unoptimized
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={checklistRecord !== null}
        onOpenChange={(open) => {
          if (!open) setChecklistRecord(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Checklist ca làm</DialogTitle>
            <DialogDescription>
              {checklistRecord
                ? `${checklistRecord.employees?.profiles?.full_name ?? "Nhân viên"} · ${checklistRecord.date}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {checklistRecord ? (
            <ChecklistDetail record={checklistRecord} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function normalizePhase(value: string): ChecklistPhase {
  return CHECKLIST_PHASES.includes(value as ChecklistPhase)
    ? (value as ChecklistPhase)
    : "trong_ca";
}

function checklistProgress(record: AttendanceRecord) {
  const items = record.attendance_checklist_items ?? [];
  const required = items.filter((item) => item.is_required);
  return {
    total: items.length,
    done: items.filter((item) => item.is_done).length,
    requiredTotal: required.length,
    requiredDone: required.filter((item) => item.is_done).length,
  };
}

function ChecklistProgressButton({
  record,
  onOpen,
}: {
  record: AttendanceRecord;
  onOpen: () => void;
}) {
  const progress = checklistProgress(record);
  if (progress.total === 0) {
    return <span className="text-sm text-muted-foreground">Trống</span>;
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onOpen}>
      {progress.requiredDone}/{progress.requiredTotal} bắt buộc ·{" "}
      {progress.done}/{progress.total}
    </Button>
  );
}

function ChecklistDetail({ record }: { record: AttendanceRecord }) {
  const items = [...(record.attendance_checklist_items ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Ca này không có checklist snapshot.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = items.filter(
          (item) => normalizePhase(item.phase) === phase,
        );
        if (phaseItems.length === 0) return null;

        return (
          <div key={phase} className="space-y-2">
            <div className="text-sm font-medium">
              {CHECKLIST_PHASE_LABELS[phase]}
            </div>
            <div className="divide-y rounded-md border">
              {phaseItems.map((item) => (
                <div key={item.id} className="flex gap-3 p-3">
                  <Badge variant={item.is_done ? "success" : "secondary"}>
                    {item.is_done ? "Xong" : "Chưa làm"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{item.title}</div>
                    {item.done_definition ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.done_definition}
                      </div>
                    ) : null}
                  </div>
                  {item.is_required ? (
                    <Badge variant="outline">Bắt buộc</Badge>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
