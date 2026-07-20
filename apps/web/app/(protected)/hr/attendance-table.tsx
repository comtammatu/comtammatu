"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR attendance checklist detail copy is local to this manager review surface */

import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition } from "react";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  BRANCH_VI,
  ERRORS_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import { formatQuantity } from "@comtammatu/shared/format";
import {
  getVNDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
  formatVNBusinessDate,
  formatVNTime,
} from "@comtammatu/shared/time";
import { isShiftEndedForBusinessDate } from "@lib/staff-runtime/_lib/default-shift";
import { messages } from "@lib/messages";
import {
  fetchAttendance,
  fetchAttendanceSummary,
  getAttendancePhotoUrl,
  forceCloseStaleAttendance,
} from "./actions";
import type { BranchOption } from "./_types";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
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
  work_hours: number;
}

interface AttendanceTableProps {
  branches: BranchOption[];
}

export function AttendanceTable({ branches }: AttendanceTableProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
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
      const viewResult =
        nextView === "summary"
          ? await fetchAttendanceSummary({ branchId, month })
          : await fetchAttendance({ branchId, month });

      if (viewResult.success) {
        if (nextView === "summary") {
          setSummary((viewResult.data ?? []) as AttendanceSummaryRow[]);
        } else {
          setRecords((viewResult.data ?? []) as AttendanceRecord[]);
        }
      } else {
        toast.error(viewResult.error ?? ERRORS_VI.fallback);
      }

    });
  }

  function selectView(nextView: "clock" | "summary") {
    setView(nextView);
    loadData(selectedBranch, selectedMonth, nextView);
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
      <div className="flex flex-col gap-3">
        <AppToolbar
          filters={
            <>
              <Select
                value={selectedBranch.toString()}
                onValueChange={(value) =>
                  loadData(Number(value), selectedMonth)
                }
              >
                <SelectTrigger className="w-48" aria-label={BRANCH_VI.select}>
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedMonth}
                onValueChange={(value) => loadData(selectedBranch, value)}
              >
                <SelectTrigger className="w-40" aria-label="Tháng chấm công">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
          actions={
            <>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(value) => {
                  if (value === "clock" || value === "summary") {
                    selectView(value);
                  }
                }}
                aria-label={attendanceCopy.summaryView}
              >
                <ToggleGroupItem value="summary" size="sm">
                  {attendanceCopy.summaryView}
                </ToggleGroupItem>
                <ToggleGroupItem value="clock" size="sm">
                  {attendanceCopy.clockView}
                </ToggleGroupItem>
              </ToggleGroup>
              {isPending ? <Spinner /> : null}
            </>
          }
        />
        <p className="text-sm text-muted-foreground">
          {attendanceCopy.workdayRule}
        </p>
      </div>

      <AppSection
        title={messages.hr.client.attendanceTitle}
        contentFlush
        contentScroll
      >
        {view === "summary" ? (
          <SummaryView data={summary} />
        ) : (
          <DetailView
            branchId={selectedBranch}
            data={records}
            onMutated={() => loadData(selectedBranch, selectedMonth, "clock")}
          />
        )}
      </AppSection>
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
      key: "index",
      header: "#",
      className: "w-12 text-right font-mono tabular-nums",
      render: (_, index) => index + 1,
    },
    {
      key: "employee",
      header: "Họ tên",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.full_name || "—"}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {row.employee_code || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "workdays",
      header: "Số ngày công",
      className: "text-right font-mono tabular-nums",
      render: (row) => formatQuantity(row.workdays),
    },
    {
      key: "work_hours",
      header: "Số giờ công",
      className: "text-right font-mono tabular-nums",
      render: (row) => formatQuantity(row.work_hours),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.employee_id}
      mobileCardRender={(row, index) => (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle size="heading" className="line-clamp-none">
              {row.full_name || "—"}
            </ItemTitle>
            <ItemDescription className="line-clamp-none text-sm leading-6">
              {row.employee_code || "—"}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="grid grid-cols-3 gap-3 text-right font-mono text-sm tabular-nums">
              <div>
                <div className="text-xs text-muted-foreground">#</div>
                <div>{index + 1}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Ngày công</div>
                <div>{formatQuantity(row.workdays)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Giờ công</div>
                <div>{formatQuantity(row.work_hours)}</div>
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
  const isTouchLayout = useIsMobile(1024);
  const forceCloseFormId = useId();
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
    if (!record.shifts) return record.date < todayStr;
    return isShiftEndedForBusinessDate(record.date, {
      id: 0,
      start_time: record.shifts.start_time,
      end_time: record.shifts.end_time,
    });
  }

  function canForceCloseRecord(record: AttendanceRecord): boolean {
    return isStaleOpenRecord(record);
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

  function photoAction(record: AttendanceRecord, touch = false) {
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
        size={touch ? "touch" : "sm"}
        className={touch ? "w-full" : undefined}
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

  function forceCloseAction(record: AttendanceRecord, touch = false) {
    if (!canForceCloseRecord(record)) return null;

    return (
      <Button
        type="button"
        variant="destructive"
        size={touch ? "touch" : "sm"}
        className={touch ? "w-full" : undefined}
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
      render: (record) => photoAction(record),
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
      render: (record) => forceCloseAction(record),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        pageSize={50}
        getRowKey={(record) => record.id}
        mobileCardRender={(record) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle size="heading" className="line-clamp-none">
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
                  touch
                  onOpen={() => setChecklistRecord(record)}
                />
              </div>
              {record.note ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {record.note}
                </p>
              ) : null}
            </ItemContent>
            <ItemActions className="basis-full">
              <div className="flex w-full flex-col items-stretch gap-2">
                {photoAction(record, true)}
                {forceCloseAction(record, true)}
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
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size={isTouchLayout ? "touch" : "default"}
              onClick={() => setClosingRecord(null)}
              disabled={isClosing}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              form={forceCloseFormId}
              size={isTouchLayout ? "touch" : "default"}
              disabled={isClosing}
            >
              {isClosing && <Spinner data-icon="inline-start" />}
              Xác nhận đóng ca
            </Button>
          </>
        }
        footerClassName="pt-4"
      >
        <form
          id={forceCloseFormId}
          onSubmit={handleForceClose}
          className="flex flex-col gap-4"
        >
          <NoteCallout tone="muted">
            Việc đóng ca sẽ đặt giờ ra bằng giờ vào (0 giờ công).
          </NoteCallout>

          <div className="flex flex-col gap-2">
            <label htmlFor="note" className="text-sm font-medium">
              Ghi chú (tuỳ chọn)
            </label>
            <Textarea id="note" name="note" placeholder="Lý do đóng ca..." />
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
  touch = false,
  onOpen,
}: {
  record: AttendanceRecord;
  touch?: boolean;
  onOpen: () => void;
}) {
  const progress = checklistProgress(record);
  if (progress.total === 0) {
    return <span className="text-sm text-muted-foreground">Trống</span>;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={touch ? "touch" : "sm"}
      className={touch ? "w-full" : undefined}
      onClick={onOpen}
    >
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
      <AppEmptyState
        compact
        className="border-0 bg-transparent"
        title="Ca này không có checklist snapshot."
      />
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
