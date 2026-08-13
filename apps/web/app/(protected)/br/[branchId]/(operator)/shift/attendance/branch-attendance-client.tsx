"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: Branch attendance checklist/force-close copy mirrors Owner HR review strings */

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  Image as IconImage,
  ListChecks as IconListChecks,
  ShieldAlert as IconShieldAlert,
} from "lucide-react";
import { ACTIONS_VI, STAFF_VI } from "@comtammatu/shared/messages";
import { formatQuantity } from "@comtammatu/shared/format";
import {
  formatVNBusinessDate,
  formatVNDate,
  formatVNTime,
  getVNDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  fetchAttendance,
  forceCloseStaleAttendance,
  getAttendancePhotoUrl,
} from "@/(protected)/hr/actions";
import {
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_PHASES,
  type ChecklistPhase,
} from "@/(protected)/hr/checklist-types";
import { StatusBadge } from "@/components/status-badge";
import { AppDialog } from "@/components/form";
import {
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
import { useBranchOpsEvents } from "@/_hooks/use-branch-ops-events";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  attendanceChecklistProgress,
  buildBranchAttendanceMonthSummary,
  filterAttendanceByEmployee,
  isStaleOpenAttendanceRecord,
  type BranchAttendanceRecord,
  type BranchAttendanceSummaryRow,
} from "@lib/hr/branch-attendance-model";
import { messages } from "@lib/messages";

type AttendanceView = "clock" | "summary";

const attendanceCopy = messages.employee.hrAttendance;
const pageCopy = messages.hr.client;

function normalizePhase(value: string): ChecklistPhase {
  return CHECKLIST_PHASES.includes(value as ChecklistPhase)
    ? (value as ChecklistPhase)
    : "during_shift";
}

function asAttendanceRecords(value: unknown): BranchAttendanceRecord[] {
  if (!Array.isArray(value)) return [];
  return value as BranchAttendanceRecord[];
}

function employeeName(record: BranchAttendanceRecord): string {
  return record.employees?.profiles?.full_name ?? STAFF_VI.long;
}

function parseEmployeeIdParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function recordStateBadge(record: BranchAttendanceRecord, todayStr: string) {
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

function ChecklistDetail({ record }: { record: BranchAttendanceRecord }) {
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

function SummaryMeta({
  workdays,
  workHours,
  closedShifts,
  openShifts,
}: {
  workdays: number;
  workHours: number;
  closedShifts: number;
  openShifts: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(
        [
          [attendanceCopy.summaryWorkdays, workdays],
          [attendanceCopy.summaryWorkHours, workHours],
          [attendanceCopy.summaryClosedShifts, closedShifts],
          [attendanceCopy.summaryOpenShifts, openShifts],
        ] as const
      ).map(([label, value]) => (
        <div
          key={label}
          className="rounded-md bg-muted/50 px-2 py-1.5"
        >
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-mono text-sm tabular-nums">
            {formatQuantity(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BranchAttendanceClient({
  branchId,
  branchName,
  canView,
  canForceClose,
  today,
  month: initialMonth,
  initialRecords,
  loadFailed: initialLoadFailed,
}: {
  branchId: number;
  branchName: string;
  canView: boolean;
  canForceClose: boolean;
  today: string;
  month: string;
  initialRecords: BranchAttendanceRecord[];
  loadFailed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceCloseFormId = useId();

  const requestedView = searchParams.get("view");
  const view: AttendanceView =
    requestedView === "summary" ? "summary" : "clock";
  const monthParam = searchParams.get("month");
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : initialMonth || getVNMonthString();
  const employeeIdParam = parseEmployeeIdParam(searchParams.get("employeeId"));

  const [records, setRecords] = useState(initialRecords);
  const [monthRecords, setMonthRecords] = useState<BranchAttendanceRecord[]>(
    [],
  );
  const [summary, setSummary] = useState<BranchAttendanceSummaryRow[]>([]);
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    employeeName: string;
    date: string;
  } | null>(null);
  const [pendingPhotoId, setPendingPhotoId] = useState<number | null>(null);
  const [closingRecord, setClosingRecord] =
    useState<BranchAttendanceRecord | null>(null);
  const [isPending, startTransition] = useTransition();
  const [, startPhotoTransition] = useTransition();
  const [isClosing, startCloseTransition] = useTransition();

  const todayStr = today || getVNDateString();
  const monthOptions = useMemo(
    () => getVNMonthSequenceBack(6).map(({ date }) => date.slice(0, 7)),
    [],
  );

  const recordById = useMemo(() => {
    const map = new Map<number, BranchAttendanceRecord>();
    for (const record of records) map.set(record.id, record);
    for (const record of monthRecords) map.set(record.id, record);
    return map;
  }, [monthRecords, records]);

  const selected = selectedId != null ? (recordById.get(selectedId) ?? null) : null;
  const canForceCloseSelected =
    selected != null &&
    canForceClose &&
    isStaleOpenAttendanceRecord(selected, todayStr);

  const selectedEmployeeSummary =
    employeeIdParam == null
      ? null
      : (summary.find((row) => row.employee_id === employeeIdParam) ?? null);
  const employeeMonthRows =
    employeeIdParam == null
      ? []
      : filterAttendanceByEmployee(monthRecords, employeeIdParam);
  const employeeMonthOpen = employeeIdParam != null && view === "summary";

  useEffect(() => {
    setRecords(initialRecords);
    setLoadFailed(initialLoadFailed);
  }, [initialRecords, initialLoadFailed]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setView = useCallback(
    (next: AttendanceView) => {
      replaceParams((params) => {
        if (next === "clock") {
          params.delete("view");
          params.delete("month");
          params.delete("employeeId");
        } else {
          params.set("view", "summary");
          if (!params.get("month")) params.set("month", month);
        }
      });
    },
    [month, replaceParams],
  );

  const setMonth = useCallback(
    (nextMonth: string) => {
      replaceParams((params) => {
        params.set("view", "summary");
        params.set("month", nextMonth);
        // Keep employeeId so month switch refreshes the open sheet.
      });
    },
    [replaceParams],
  );

  const openEmployeeMonth = useCallback(
    (employeeId: number) => {
      replaceParams((params) => {
        params.set("view", "summary");
        params.set("month", month);
        params.set("employeeId", String(employeeId));
      });
    },
    [month, replaceParams],
  );

  const closeEmployeeMonth = useCallback(() => {
    replaceParams((params) => {
      params.delete("employeeId");
    });
  }, [replaceParams]);

  const reloadClock = useCallback(() => {
    if (!canView) return;
    startTransition(async () => {
      const result = await fetchAttendance({
        branchId,
        month: getVNMonthString(todayStr),
        day: todayStr,
      });
      if (!result.success) {
        toast.error(result.error ?? attendanceCopy.loadHint);
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setRecords(asAttendanceRecords(result.data));
    });
  }, [branchId, canView, todayStr]);

  const loadMonth = useCallback(
    (targetMonth: string) => {
      if (!canView) return;
      startTransition(async () => {
        const result = await fetchAttendance({
          branchId,
          month: targetMonth,
        });
        if (!result.success) {
          toast.error(result.error ?? attendanceCopy.loadHint);
          setMonthRecords([]);
          setSummary([]);
          setSummaryLoaded(true);
          return;
        }
        const nextRecords = asAttendanceRecords(result.data);
        setMonthRecords(nextRecords);
        setSummary(buildBranchAttendanceMonthSummary(nextRecords));
        setSummaryLoaded(true);
      });
    },
    [branchId, canView],
  );

  useEffect(() => {
    if (view !== "summary") return;
    setSummaryLoaded(false);
    loadMonth(month);
  }, [loadMonth, month, view]);

  useBranchOpsEvents({
    branchId,
    enabled: canView && view === "clock",
    onEvent: reloadClock,
  });

  function openPhoto(record: BranchAttendanceRecord) {
    if (!record.check_in_photo_path) return;
    const recordBranchId = record.branch_id ?? branchId;
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
        employeeName: employeeName(record),
        date: record.date,
      });
      setPhotoOpen(true);
    });
  }

  function handleForceClose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!closingRecord) return;
    const recordBranchId = closingRecord.branch_id ?? branchId;
    const formData = new FormData(e.currentTarget);
    const note = String(formData.get("note") ?? "");

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
      setSelectedId(null);
      reloadClock();
      if (view === "summary") loadMonth(month);
    });
  }

  if (!canView) {
    return (
      <BranchOperatorPage
        title={pageCopy.branchAttendanceTitle}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          icon={<IconShieldAlert />}
          mode="no-access"
        />
      </BranchOperatorPage>
    );
  }

  const employeeSheetTitle =
    selectedEmployeeSummary?.full_name ||
    employeeMonthRows[0]?.employees?.profiles?.full_name ||
    STAFF_VI.long;
  const employeeSheetCode =
    selectedEmployeeSummary?.employee_code ||
    employeeMonthRows[0]?.employees?.employee_code ||
    null;

  return (
    <BranchOperatorPage
      title={pageCopy.branchAttendanceTitle}
      description={branchName}
      hideHeaderOnMobile
    >
      <div className="flex flex-col gap-3">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value === "clock" || value === "summary") setView(value);
          }}
          size="touch"
          className="grid w-full grid-cols-2"
          aria-label={attendanceCopy.viewSwitcher}
        >
          <ToggleGroupItem value="clock">
            {attendanceCopy.clockView}
          </ToggleGroupItem>
          <ToggleGroupItem value="summary">
            {attendanceCopy.summaryView}
          </ToggleGroupItem>
        </ToggleGroup>

        {view === "summary" ? (
          <Select value={month} onValueChange={setMonth} disabled={isPending}>
            <SelectTrigger size="touch" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option} value={option} size="touch">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <BranchOperatorPanel
          title={
            view === "clock"
              ? attendanceCopy.clockView
              : attendanceCopy.summaryView
          }
          description={
            view === "clock"
              ? formatVNBusinessDate(todayStr)
              : attendanceCopy.workdayRule
          }
          icon={IconListChecks}
          badge={{
            children: view === "clock" ? records.length : summary.length,
          }}
          size="sm"
        >
          {view === "clock" ? (
            loadFailed ? (
              <AppEmptyState
                compact
                mode="error"
                icon={<IconListChecks />}
                title={attendanceCopy.loadHint}
              >
                <Button size="touch" onClick={reloadClock}>
                  {ACTIONS_VI.retry}
                </Button>
              </AppEmptyState>
            ) : records.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconListChecks />}
                title={attendanceCopy.detailEmptyTitle}
                description={attendanceCopy.detailEmptyDescription}
              />
            ) : (
              <ItemGroup className="grid gap-2">
                {records.map((record) => {
                  const progress = attendanceChecklistProgress(record);
                  return (
                    <Item
                      key={record.id}
                      variant="outline"
                      className="min-h-20 touch-manipulation"
                      render={
                        <button
                          type="button"
                          onClick={() => {
                            setChecklistOpen(false);
                            setSelectedId(record.id);
                          }}
                        />
                      }
                    >
                      <ItemContent className="min-w-0 gap-1 text-left">
                        <ItemTitle size="heading">
                          {employeeName(record)}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none">
                          {record.shifts?.name ?? "—"} ·{" "}
                          {attendanceCopy.checkIn}{" "}
                          {record.check_in
                            ? formatVNTime(record.check_in)
                            : "—"}{" "}
                          · {attendanceCopy.checkOut}{" "}
                          {record.check_out
                            ? formatVNTime(record.check_out)
                            : "—"}
                        </ItemDescription>
                        {progress.total > 0 ? (
                          <ItemDescription>
                            {progress.requiredDone}/{progress.requiredTotal} bắt
                            buộc · {progress.done}/{progress.total}
                          </ItemDescription>
                        ) : null}
                      </ItemContent>
                      <ItemActions>
                        {recordStateBadge(record, todayStr)}
                        <IconChevronRight className="size-4 text-muted-foreground" />
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            )
          ) : !summaryLoaded || isPending ? (
            <div className="flex items-center justify-center py-4">
              <Spinner />
            </div>
          ) : summary.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-data"
              icon={<IconListChecks />}
              title={attendanceCopy.summaryEmptyTitle}
              description={attendanceCopy.summaryEmptyDescription}
            />
          ) : (
            <ItemGroup className="grid gap-2">
              {summary.map((row) => (
                <Item
                  key={row.employee_id}
                  variant="outline"
                  className="min-h-20 touch-manipulation"
                  render={
                    <button
                      type="button"
                      onClick={() => openEmployeeMonth(row.employee_id)}
                    />
                  }
                >
                  <ItemContent className="min-w-0 gap-2 text-left">
                    <div className="min-w-0">
                      <ItemTitle size="heading">
                        {row.full_name || "—"}
                      </ItemTitle>
                      <ItemDescription className="font-mono">
                        {row.employee_code || "—"}
                      </ItemDescription>
                    </div>
                    <SummaryMeta
                      workdays={row.workdays}
                      workHours={row.work_hours}
                      closedShifts={row.closedShifts}
                      openShifts={row.openShifts}
                    />
                    <ItemDescription>
                      {attendanceCopy.summaryRowHint}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>

      <AppSheet
        open={employeeMonthOpen}
        onOpenChange={(open) => {
          if (!open) closeEmployeeMonth();
        }}
        title={employeeSheetTitle}
        description={[employeeSheetCode, month, attendanceCopy.employeeMonthTitle]
          .filter(Boolean)
          .join(" · ")}
        side="bottom"
        contentClassName="flex max-h-dvh-80 flex-col"
        headerClassName="text-left"
        bodyClassName="overscroll-contain px-4 pb-2"
        footerClassName="sticky bottom-0 border-t bg-background"
        footer={
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full"
            onClick={closeEmployeeMonth}
          >
            {attendanceCopy.employeeMonthClose}
          </Button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden">
          {selectedEmployeeSummary ? (
            <SummaryMeta
              workdays={selectedEmployeeSummary.workdays}
              workHours={selectedEmployeeSummary.work_hours}
              closedShifts={selectedEmployeeSummary.closedShifts}
              openShifts={selectedEmployeeSummary.openShifts}
            />
          ) : null}

          {!summaryLoaded || isPending ? (
            <div className="flex items-center justify-center py-4">
              <Spinner />
            </div>
          ) : employeeMonthRows.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-data"
              icon={<IconListChecks />}
              title={attendanceCopy.employeeMonthEmptyTitle}
              description={attendanceCopy.employeeMonthEmptyDescription}
            />
          ) : (
            <ItemGroup className="grid gap-2">
              {employeeMonthRows.map((record) => {
                const progress = attendanceChecklistProgress(record);
                return (
                  <Item
                    key={record.id}
                    variant="outline"
                    className="min-h-16 touch-manipulation"
                    render={
                      <button
                        type="button"
                        onClick={() => {
                          setChecklistOpen(false);
                          setSelectedId(record.id);
                        }}
                      />
                    }
                  >
                    <ItemContent className="min-w-0 gap-1 text-left">
                      <ItemTitle>
                        {formatVNDate(record.date)}
                        {record.shifts?.name ? ` · ${record.shifts.name}` : ""}
                      </ItemTitle>
                      <ItemDescription className="font-mono">
                        {record.check_in ? formatVNTime(record.check_in) : "—"}{" "}
                        –{" "}
                        {record.check_out
                          ? formatVNTime(record.check_out)
                          : "—"}
                      </ItemDescription>
                      {progress.total > 0 ? (
                        <ItemDescription>
                          {progress.requiredDone}/{progress.requiredTotal} bắt
                          buộc
                        </ItemDescription>
                      ) : null}
                    </ItemContent>
                    <ItemActions>
                      {recordStateBadge(record, todayStr)}
                      <IconChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </div>
      </AppSheet>

      <AppSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setChecklistOpen(false);
          }
        }}
        title={selected ? employeeName(selected) : ""}
        description={
          selected
            ? `${formatVNBusinessDate(selected.date)} · ${selected.shifts?.name ?? "—"}`
            : undefined
        }
        side="bottom"
        contentClassName="flex max-h-dvh-80 flex-col"
        headerClassName="text-left"
        footerClassName="sticky bottom-0 border-t bg-background"
        footer={
          checklistOpen ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              onClick={() => setChecklistOpen(false)}
            >
              Quay lại
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              onClick={() => setSelectedId(null)}
            >
              Đóng
            </Button>
          )
        }
      >
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden">
            <div className="flex flex-wrap gap-2">
              {recordStateBadge(selected, todayStr)}
            </div>
            <div className="font-mono text-sm text-muted-foreground">
              {attendanceCopy.checkIn}:{" "}
              {selected.check_in ? formatVNTime(selected.check_in) : "—"} ·{" "}
              {attendanceCopy.checkOut}:{" "}
              {selected.check_out ? formatVNTime(selected.check_out) : "—"}
            </div>
            {selected.note ? (
              <p className="text-sm text-muted-foreground">{selected.note}</p>
            ) : null}

            {checklistOpen ? (
              <ChecklistDetail record={selected} />
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="w-full"
                  onClick={() => setChecklistOpen(true)}
                  disabled={
                    (selected.attendance_checklist_items?.length ?? 0) === 0
                  }
                >
                  <IconListChecks data-icon="inline-start" />
                  Việc trong ca
                </Button>
                {selected.check_in_photo_path ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="w-full"
                    disabled={pendingPhotoId !== null}
                    onClick={() => openPhoto(selected)}
                  >
                    {pendingPhotoId === selected.id ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <IconImage data-icon="inline-start" />
                    )}
                    {attendanceCopy.viewPhoto}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {attendanceCopy.noPhoto}
                  </p>
                )}
                {canForceCloseSelected ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="touch"
                    className="w-full"
                    onClick={() => setClosingRecord(selected)}
                  >
                    Đóng ca treo
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </AppSheet>

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

      <AppSheet
        open={closingRecord !== null}
        onOpenChange={(open) => {
          if (!open) setClosingRecord(null);
        }}
        title="Đóng ca làm việc"
        description={`Ca làm việc của ${closingRecord ? employeeName(closingRecord) : "nhân viên"} ngày ${formatVNBusinessDate(closingRecord?.date, "")} đang mở.`}
        side="bottom"
        contentClassName="flex max-h-dvh-80 flex-col"
        headerClassName="text-left"
        footerClassName="sticky bottom-0 border-t bg-background"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="min-w-0 flex-1"
              onClick={() => setClosingRecord(null)}
              disabled={isClosing}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              form={forceCloseFormId}
              size="touch"
              className="min-w-0 flex-1"
              disabled={isClosing}
            >
              {isClosing ? <Spinner data-icon="inline-start" /> : null}
              Xác nhận đóng ca
            </Button>
          </>
        }
      >
        <form
          id={forceCloseFormId}
          onSubmit={handleForceClose}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <NoteCallout tone="muted">
            Việc đóng ca sẽ đặt giờ ra bằng giờ vào (0 giờ công).
          </NoteCallout>
          <div className="flex flex-col gap-2">
            <Label htmlFor="branch-force-close-note">Lý do đóng ca</Label>
            <Textarea
              id="branch-force-close-note"
              name="note"
              placeholder="Nhập lý do đóng ca"
              minLength={5}
              maxLength={500}
              required
              className="min-h-24"
            />
          </div>
        </form>
      </AppSheet>
    </BranchOperatorPage>
  );
}
