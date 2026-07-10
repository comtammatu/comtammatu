"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR attendance checklist detail copy is local to this manager review surface */

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { Image as IconImage, ListChecks as IconListChecks } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  BRANCH_VI,
  ERRORS_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import {
  getVNDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
  formatVNBusinessDate,
  formatVNTime,
  parseClockTimeToMinutes,
  getVNMinutesOfDay,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  fetchAttendance,
  fetchAttendanceSummary,
  getAttendancePhotoUrl,
  forceCloseStaleAttendance,
} from "./actions";
import { fetchApprovedLeaveMonth } from "./leave-request-actions";
import type { BranchOption } from "./_types";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState } from "@/components/surface";
import { AppDialog } from "@/components/form/form-dialog";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
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
  workdays: number;
  open: number;
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

  // `nextView` rides as a parameter: the view-toggle handlers call
  // setView + loadData in the same tick, so reading `view` from the
  // closure would fetch the PREVIOUS mode and render an empty table.
  function loadData(
    branchId: number,
    month: string,
    nextView: "clock" | "summary" = view,
  ) {
    setSelectedBranch(branchId);
    setSelectedMonth(month);
    startTransition(async () => {
      const [viewResult, leaveResult] = await Promise.all([
        nextView === "summary"
          ? fetchAttendanceSummary({ branchId, month })
          : fetchAttendance({ branchId, month }),
        fetchApprovedLeaveMonth({ branchId, month }),
      ]);

      if (viewResult.success) {
        if (nextView === "summary") {
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

  // Initial load on mount — the tab used to open blank with a hint
  // pointing at a load button that does not exist.
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    loadData(selectedBranch, selectedMonth);
  }, []);

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

        <div className="flex gap-1 rounded-md border p-1">
          <Button
            variant={view === "summary" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView("summary");
              loadData(selectedBranch, selectedMonth, "summary");
            }}
          >
            {attendanceCopy.summaryView}
          </Button>
          <Button
            variant={view === "clock" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView("clock");
              loadData(selectedBranch, selectedMonth, "clock");
            }}
          >
            {attendanceCopy.clockView}
          </Button>
        </div>

        {isPending && <Spinner />}
      </div>
      <p className="text-sm text-muted-foreground">
        {attendanceCopy.workdayRule}
      </p>

      {view === "summary" ? (
        <SummaryView data={summary} />
      ) : (
        <DetailView
          branchId={selectedBranch}
          data={records}
          onMutated={() => loadData(selectedBranch, selectedMonth, "clock")}
        />
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
  const columns: DataTableColumn<ApprovedLeaveRow>[] = [
    {
      key: "employee_code",
      header: attendanceCopy.employeeCode,
      className: "font-mono",
      render: (leave) => leave.employees?.employee_code ?? "—",
    },
    {
      key: "full_name",
      header: attendanceCopy.fullName,
      render: (leave) =>
        leave.employees?.profiles?.full_name ?? leaveCopy.fallbackEmployee,
    },
    {
      key: "range",
      header: attendanceCopy.leaveRange,
      className: "font-mono tabular-nums",
      render: (leave) =>
        leave.start_date === leave.end_date
          ? formatLeaveDate(leave.start_date)
          : `${formatLeaveDate(leave.start_date)} - ${formatLeaveDate(leave.end_date)}`,
    },
    {
      key: "type",
      header: attendanceCopy.leaveType,
      render: (leave) => {
        const typeLabel =
          leaveCopy.types[leave.leave_type as keyof typeof leaveCopy.types] ??
          leaveCopy.types.other;
        return <Badge variant="outline">{typeLabel}</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{attendanceCopy.leaveTitle}</p>
        <Badge variant="info">{attendanceCopy.leaveCount(leaves.length)}</Badge>
      </div>
      <DataTable
        columns={columns}
        data={leaves}
        getRowKey={(leave) => leave.id}
        mobileCardRender={(leave) => {
          const typeLabel =
            leaveCopy.types[leave.leave_type as keyof typeof leaveCopy.types] ??
            leaveCopy.types.other;
          return (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle className="line-clamp-none text-sm font-semibold">
                  {leave.employees?.profiles?.full_name ??
                    leaveCopy.fallbackEmployee}
                </ItemTitle>
                <ItemDescription className="line-clamp-none text-sm leading-6">
                  {leave.start_date === leave.end_date
                    ? formatLeaveDate(leave.start_date)
                    : `${formatLeaveDate(leave.start_date)} - ${formatLeaveDate(leave.end_date)}`}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant="outline">{typeLabel}</Badge>
              </ItemActions>
            </Item>
          );
        }}
      />
    </div>
  );
}

function SummaryView({ data }: { data: AttendanceSummaryRow[] }) {
  if (data.length === 0) {
    return (
      <AppEmptyState
        title={attendanceCopy.summaryEmptyTitle}
        description={attendanceCopy.summaryEmptyDescription}
        icon={<IconListChecks />}
      />
    );
  }

  const columns: DataTableColumn<AttendanceSummaryRow>[] = [
    {
      key: "employee_code",
      header: attendanceCopy.employeeCode,
      className: "font-mono",
      render: (row) => row.employee_code,
    },
    {
      key: "full_name",
      header: attendanceCopy.fullName,
      render: (row) => row.full_name,
    },
    {
      key: "workdays",
      header: "Số công",
      className: "text-center font-bold tabular-nums",
      render: (row) => row.workdays,
    },
    {
      key: "open",
      header: "Ca chưa kết",
      className: "text-center tabular-nums",
      render: (row) => (
        <span
          className={
            row.open > 0
              ? "font-medium text-warning-foreground"
              : "text-muted-foreground"
          }
        >
          {row.open}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.employee_id}
      mobileCardRender={(row) => (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle className="line-clamp-none text-sm font-semibold">
              {row.full_name}
            </ItemTitle>
            <ItemDescription className="line-clamp-none text-sm leading-6">
              {row.employee_code}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="text-right">
              <div className="font-mono text-sm font-bold">{row.workdays}</div>
              <div className="text-xs text-muted-foreground">
                {row.open} ca chưa kết
              </div>
            </div>
          </ItemActions>
        </Item>
      )}
    />
  );
}

function DetailView({
  branchId,
  data,
  onMutated,
}: {
  branchId: number;
  data: AttendanceRecord[];
  onMutated: () => void;
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

  const [closingRecord, setClosingRecord] = useState<AttendanceRecord | null>(
    null,
  );
  const [isClosing, startCloseTransition] = useTransition();

  const todayStr = getVNDateString();

  function openPhoto(record: AttendanceRecord) {
    if (!record.check_in_photo_path) return;

    setPendingPhotoId(record.id);
    startPhotoTransition(async () => {
      const result = await getAttendancePhotoUrl({
        attendanceId: record.id,
        branchId,
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

  function handleForceClose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!closingRecord) return;

    const formData = new FormData(e.currentTarget);
    const note = formData.get("note") as string;

    startCloseTransition(async () => {
      const result = await forceCloseStaleAttendance({
        attendanceId: closingRecord.id,
        branchId,
        note,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Đã đóng ca thành công (0 giờ công)");
      setClosingRecord(null);
      onMutated();
    });
  }

  function isStaleOpenRecord(record: AttendanceRecord): boolean {
    if (!record.check_in || record.check_out) return false;
    if (record.date < todayStr) return true;
    if (record.date !== todayStr) return false;

    const start = parseClockTimeToMinutes(record.shifts?.start_time || "");
    const end = parseClockTimeToMinutes(record.shifts?.end_time || "");
    if (start === null || end === null || end <= start) return false;
    return getVNMinutesOfDay() >= end;
  }

  function canForceCloseRecord(record: AttendanceRecord): boolean {
    return !!record.check_in && !record.check_out && record.date < todayStr;
  }

  function recordStateBadge(record: AttendanceRecord) {
    if (isStaleOpenRecord(record)) {
      return <StatusBadge domain="attendance" value="stale_open" />;
    }
    if (record.check_out) {
      return (
        <StatusBadge
          domain="attendance"
          value="checked_out"
          label={attendanceCopy.checkedOut}
        />
      );
    }
    if (record.check_in) {
      return (
        <StatusBadge
          domain="attendance"
          value="in_shift"
          label={attendanceCopy.inShift}
        />
      );
    }
    return <StatusBadge domain="attendance" value={record.status} />;
  }

  function photoAction(record: AttendanceRecord) {
    const photoPending = pendingPhotoId === record.id;
    if (!record.check_in_photo_path) {
      return (
        <span className="text-sm text-muted-foreground">
          {attendanceCopy.noPhoto}
        </span>
      );
    }

    return (
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
    );
  }

  function forceCloseAction(record: AttendanceRecord) {
    if (!canForceCloseRecord(record)) return null;

    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setClosingRecord(record)}
      >
        Đóng ca treo
      </Button>
    );
  }

  if (data.length === 0) {
    return (
      <AppEmptyState
        title={attendanceCopy.detailEmptyTitle}
        description={attendanceCopy.detailEmptyDescription}
        icon={<IconListChecks />}
      />
    );
  }

  const columns: DataTableColumn<AttendanceRecord>[] = [
    {
      key: "date",
      header: FORM_VI.date,
      className: "font-mono text-sm",
      render: (record) => formatVNBusinessDate(record.date),
    },
    {
      key: "employee",
      header: STAFF_VI.long,
      render: (record) => record.employees?.profiles?.full_name ?? "—",
    },
    {
      key: "shift",
      header: attendanceCopy.shift,
      className: "text-sm text-muted-foreground",
      render: (record) => record.shifts?.name ?? "—",
    },
    {
      key: "template",
      header: "Template",
      className: "text-sm",
      render: (record) =>
        record.shift_checklist_templates?.name ?? (
          <span className="text-muted-foreground">Chưa gán</span>
        ),
    },
    {
      key: "checklist",
      header: "Checklist",
      render: (record) => (
        <ChecklistProgressButton
          record={record}
          onOpen={() => setChecklistRecord(record)}
        />
      ),
    },
    {
      key: "check_in",
      header: attendanceCopy.checkIn,
      className: "font-mono text-sm",
      render: (record) =>
        record.check_in ? formatVNTime(record.check_in) : "—",
    },
    {
      key: "check_out",
      header: attendanceCopy.checkOut,
      className: "font-mono text-sm",
      render: (record) =>
        record.check_out ? formatVNTime(record.check_out) : "—",
    },
    {
      key: "state",
      header: attendanceCopy.recordState,
      render: recordStateBadge,
    },
    {
      key: "photo",
      header: attendanceCopy.photo,
      render: photoAction,
    },
    {
      key: "note",
      header: FORM_VI.notes,
      className: "max-w-48 truncate text-sm text-muted-foreground",
      render: (record) => record.note ?? "",
    },
    {
      key: "actions",
      header: "Thao tác",
      render: forceCloseAction,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        getRowKey={(record) => record.id}
        mobileCardRender={(record) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {record.employees?.profiles?.full_name ?? "—"}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {formatVNBusinessDate(record.date)} ·{" "}
                {record.shifts?.name ?? "—"}
              </ItemDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                {recordStateBadge(record)}
                <ChecklistProgressButton
                  record={record}
                  onOpen={() => setChecklistRecord(record)}
                />
              </div>
              {record.note ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {record.note}
                </p>
              ) : null}
            </ItemContent>
            <ItemActions>
              <div className="flex gap-2 items-center">
                {photoAction(record)}
                {forceCloseAction(record)}
              </div>
            </ItemActions>
          </Item>
        )}
      />

      <AppDialog
        open={photoOpen}
        onOpenChange={(open) => {
          setPhotoOpen(open);
          if (!open) setPhotoPreview(null);
        }}
        title={attendanceCopy.photoDialogTitle}
        description={attendanceCopy.photoDialogDescription}
        contentClassName="sm:max-w-lg"
      >
        {photoPreview ? (
          <Image
            src={photoPreview.url}
            alt={attendanceCopy.photoAlt(
              photoPreview.employeeName,
              formatVNBusinessDate(photoPreview.date),
            )}
            width={960}
            height={720}
            className="h-auto max-h-dvh-80 w-full rounded-md object-contain"
            unoptimized
          />
        ) : null}
      </AppDialog>

      <AppDialog
        open={checklistRecord !== null}
        onOpenChange={(open) => {
          if (!open) setChecklistRecord(null);
        }}
        title="Checklist ca làm"
        description={
          checklistRecord
            ? `${checklistRecord.employees?.profiles?.full_name ?? "Nhân viên"} · ${formatVNBusinessDate(checklistRecord.date)}`
            : ""
        }
        contentClassName="sm:max-w-2xl"
      >
        {checklistRecord ? <ChecklistDetail record={checklistRecord} /> : null}
      </AppDialog>

      <AppDialog
        open={closingRecord !== null}
        onOpenChange={(open) => {
          if (!open) setClosingRecord(null);
        }}
        title="Đóng ca làm việc"
        description={`Ca làm việc của ${closingRecord?.employees?.profiles?.full_name ?? "nhân viên"} ngày ${formatVNBusinessDate(closingRecord?.date, "")} đang mở.`}
      >
        <form onSubmit={handleForceClose} className="flex flex-col gap-4">
          <NoteCallout tone="muted">
            Việc đóng ca sẽ đặt giờ ra bằng giờ vào (0 giờ công).
          </NoteCallout>

          <div className="flex flex-col gap-2">
            <label htmlFor="note" className="text-sm font-medium">
              Ghi chú (tuỳ chọn)
            </label>
            <Textarea id="note" name="note" placeholder="Lý do đóng ca..." />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClosingRecord(null)}
              disabled={isClosing}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={isClosing}>
              {isClosing && <Spinner data-icon="inline-start" />}
              Xác nhận đóng ca
            </Button>
          </div>
        </form>
      </AppDialog>
    </>
  );
}

function normalizePhase(value: string): ChecklistPhase {
  return CHECKLIST_PHASES.includes(value as ChecklistPhase)
    ? (value as ChecklistPhase)
    : "during_shift";
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
    <div className="flex flex-col gap-4">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = items.filter(
          (item) => normalizePhase(item.phase) === phase,
        );
        if (phaseItems.length === 0) return null;

        return (
          <div key={phase} className="flex flex-col gap-2">
            <div className="text-sm font-medium">
              {CHECKLIST_PHASE_LABELS[phase]}
            </div>
            <ItemGroup>
              {phaseItems.map((item) => (
                <Item key={item.id} variant="outline" className="items-start">
                  <Badge variant={item.is_done ? "success" : "secondary"}>
                    {item.is_done ? "Xong" : "Chưa làm"}
                  </Badge>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="line-clamp-none text-sm">
                      {item.title}
                    </ItemTitle>
                    {item.done_definition ? (
                      <ItemDescription className="line-clamp-none">
                        {item.done_definition}
                      </ItemDescription>
                    ) : null}
                  </ItemContent>
                  {item.is_required ? (
                    <ItemActions>
                      <Badge variant="outline">Bắt buộc</Badge>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          </div>
        );
      })}
    </div>
  );
}
