"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR attendance checklist detail copy is local to this manager review surface */

import Image from "next/image";
import { useId, useState, useTransition } from "react";
import {
  Image as IconImage,
  ListChecks as IconListChecks,
  Pencil,
} from "lucide-react";
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
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { STAFF_VI, FORM_VI } from "@comtammatu/shared/messages";
import {
  getVNDateString,
  formatVNBusinessDate,
  formatVNTime,
} from "@comtammatu/shared/time";
import { shiftWorkdaysFromAttendanceRecord } from "@lib/staff-runtime/_lib/workday-math";
import { isStaleOpenAttendanceRecord } from "@lib/hr/branch-attendance-model";
import { messages } from "@lib/messages";
import {
  getAttendancePhotoUrl,
  forceCloseStaleAttendance,
  correctAttendanceRecord,
} from "../actions";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState } from "@/components/surface";
import {
  AppDialog,
  FormDialog,
  TextareaField,
  TextField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_PHASES,
  type ChecklistPhase,
} from "../checklist-types";
import {
  attendanceCorrectionSchema,
  toLocalDateTime,
  type AttendanceCorrectionValues,
  type AttendanceRecord,
} from "./attendance-types";

const attendanceCopy = messages.employee.hrAttendance;

export function DetailView({
  branchId,
  data,
  compact = false,
  todayColumns = false,
  loading = false,
  canForceClose,
  canCorrect,
  onMutated,
}: {
  branchId: number | null;
  data: AttendanceRecord[];
  compact?: boolean;
  todayColumns?: boolean;
  loading?: boolean;
  canForceClose: boolean;
  canCorrect: boolean;
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
  const [correctingRecord, setCorrectingRecord] =
    useState<AttendanceRecord | null>(null);

  const todayStr = getVNDateString();

  function openPhoto(record: AttendanceRecord) {
    if (!record.check_in_photo_path) return;
    const recordBranchId = record.branch_id ?? branchId;
    if (recordBranchId == null) {
      toast.error(attendanceCopy.photoLoadError);
      return;
    }

    setPendingPhotoId(record.id);
    startPhotoTransition(async () => {
      const result = await getAttendancePhotoUrl({
        attendanceId: record.id,
        branchId: recordBranchId,
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
    const recordBranchId = closingRecord.branch_id ?? branchId;
    if (recordBranchId == null) return;

    const formData = new FormData(e.currentTarget);
    const note = formData.get("note") as string;

    startCloseTransition(async () => {
      const result = await forceCloseStaleAttendance({
        attendanceId: closingRecord.id,
        branchId: recordBranchId,
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

  function canForceCloseRecord(record: AttendanceRecord): boolean {
    return (
      canForceClose &&
      (record.branch_id ?? branchId) != null &&
      isStaleOpenAttendanceRecord(record, todayStr)
    );
  }

  function workdayBreakdown(record: AttendanceRecord) {
    const workdays = shiftWorkdaysFromAttendanceRecord({
      checkIn: record.check_in,
      checkOut: record.check_out,
      scheduledStart: record.scheduled_start_at,
      scheduledEnd: record.scheduled_end_at,
    });
    if (!record.scheduled_start_at || !record.scheduled_end_at) {
      return "Chưa có khung ca · 0 công";
    }
    return `${formatVNTime(record.scheduled_start_at)}–${formatVNTime(record.scheduled_end_at)} · ${workdays} công`;
  }

  function recordStateBadge(record: AttendanceRecord) {
    if (isStaleOpenAttendanceRecord(record, todayStr)) {
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

  function correctionAction(record: AttendanceRecord, touch = false) {
    if (!canCorrect || !record.check_in) return null;
    return (
      <Button
        type="button"
        variant="outline"
        size={touch ? "touch" : "sm"}
        className={touch ? "w-full" : undefined}
        onClick={() => setCorrectingRecord(record)}
      >
        <Pencil data-icon="inline-start" />
        Hiệu chỉnh
      </Button>
    );
  }

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner />
      </div>
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

  const compactColumns: DataTableColumn<AttendanceRecord>[] = [
    {
      key: "shift",
      header: attendanceCopy.shift,
      className: "text-sm text-muted-foreground",
      render: (record) => record.shifts?.name ?? "—",
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
      key: "workday",
      header: "Công",
      className: "text-sm",
      render: (record) => workdayBreakdown(record),
    },
    {
      key: "state",
      header: attendanceCopy.recordState,
      render: recordStateBadge,
    },
    {
      key: "actions",
      header: "Thao tác",
      render: (record) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <ChecklistProgressButton
            record={record}
            onOpen={() => setChecklistRecord(record)}
          />
          {correctionAction(record)}
          {forceCloseAction(record)}
        </div>
      ),
    },
  ];

  const columns: DataTableColumn<AttendanceRecord>[] = todayColumns
    ? [
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
          key: "actions",
          header: "Thao tác",
          render: (record) => (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <ChecklistProgressButton
                record={record}
                onOpen={() => setChecklistRecord(record)}
              />
              {photoAction(record)}
              {correctionAction(record)}
              {forceCloseAction(record)}
            </div>
          ),
        },
      ]
    : compact
      ? compactColumns
      : [
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
          header: "Mẫu",
          className: "text-sm",
          render: (record) =>
            record.shift_checklist_templates?.name ?? (
              <span className="text-muted-foreground">Chưa gán</span>
            ),
        },
        {
          key: "checklist",
          header: "Việc trong ca",
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
          render: (record) => (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {correctionAction(record)}
              {forceCloseAction(record)}
            </div>
          ),
        },
      ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        pageSize={50}
        getRowKey={(record) => record.id}
        mobileBreakpoint={compact ? 10_000 : undefined}
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
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {attendanceCopy.checkIn}:{" "}
                {record.check_in ? formatVNTime(record.check_in) : "—"} ·{" "}
                {attendanceCopy.checkOut}:{" "}
                {record.check_out ? formatVNTime(record.check_out) : "—"}
              </p>
              {compact ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {workdayBreakdown(record)}
                </p>
              ) : null}
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
                {correctionAction(record, true)}
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

      {correctingRecord ? (
        <FormDialog<AttendanceCorrectionValues>
          key={correctingRecord.id}
          open
          onOpenChange={(open) => {
            if (!open) setCorrectingRecord(null);
          }}
          title="Hiệu chỉnh giờ chấm công"
          description={`${correctingRecord.employees?.profiles?.full_name ?? "Nhân viên"} · ${formatVNBusinessDate(correctingRecord.date)}`}
          schema={attendanceCorrectionSchema}
          defaultValues={{
            checkIn: toLocalDateTime(correctingRecord.check_in),
            checkOut: toLocalDateTime(correctingRecord.check_out),
            reason: "",
          }}
          onSubmit={async (values) => {
            const result = await correctAttendanceRecord({
              attendanceId: correctingRecord.id,
              checkIn: new Date(values.checkIn).toISOString(),
              checkOut: values.checkOut
                ? new Date(values.checkOut).toISOString()
                : null,
              reason: values.reason,
            });
            if (result.success) {
              setCorrectingRecord(null);
              onMutated();
            }
            return result;
          }}
          submitLabel="Lưu hiệu chỉnh"
          successMessage="Đã hiệu chỉnh giờ chấm công."
        >
          {(form) => (
            <>
              <TextField
                control={form.control}
                name="checkIn"
                type="datetime-local"
                label="Giờ vào"
                required
              />
              <TextField
                control={form.control}
                name="checkOut"
                type="datetime-local"
                label="Giờ ra"
              />
              <TextareaField
                control={form.control}
                name="reason"
                label="Lý do hiệu chỉnh"
                maxLength={500}
                required
              />
            </>
          )}
        </FormDialog>
      ) : null}

      {isTouchLayout ? (
        <Sheet
          open={checklistRecord !== null}
          onOpenChange={(open) => {
            if (!open) setChecklistRecord(null);
          }}
        >
          <SheetContent side="bottom" className="max-h-dvh-80">
            <SheetHeader className="text-left">
              <SheetTitle>Việc trong ca</SheetTitle>
              <SheetDescription>
                {checklistRecord
                  ? `${checklistRecord.employees?.profiles?.full_name ?? "Nhân viên"} · ${formatVNBusinessDate(checklistRecord.date)}`
                  : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {checklistRecord ? (
                <ChecklistDetail record={checklistRecord} />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <AppDialog
          open={checklistRecord !== null}
          onOpenChange={(open) => {
            if (!open) setChecklistRecord(null);
          }}
          title="Việc trong ca"
          description={
            checklistRecord
              ? `${checklistRecord.employees?.profiles?.full_name ?? "Nhân viên"} · ${formatVNBusinessDate(checklistRecord.date)}`
              : ""
          }
          contentClassName="sm:max-w-2xl"
        >
          {checklistRecord ? (
            <ChecklistDetail record={checklistRecord} />
          ) : null}
        </AppDialog>
      )}

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
              Lý do đóng ca
            </label>
            <Textarea
              id="note"
              name="note"
              placeholder="Nhập lý do đóng ca"
              minLength={5}
              maxLength={500}
              required
            />
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
        title="Ca này không có dữ liệu danh sách kiểm tra đã lưu."
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
