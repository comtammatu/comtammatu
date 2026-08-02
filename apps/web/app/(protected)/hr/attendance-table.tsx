"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR attendance checklist detail copy is local to this manager review surface */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  Image as IconImage,
  ListChecks as IconListChecks,
  Pencil,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Frame } from "@comtammatu/ui/components/frame";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { ERRORS_VI, FORM_VI, STAFF_VI } from "@comtammatu/shared/messages";
import { formatQuantity } from "@comtammatu/shared/format";
import {
  getVNDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
  formatVNBusinessDate,
  formatVNTime,
} from "@comtammatu/shared/time";
import { isShiftEndedForBusinessDate } from "@lib/staff-runtime/_lib/default-shift";
import { countCompletedShiftWorkdays } from "@lib/staff-runtime/_lib/workday-math";
import { messages } from "@lib/messages";
import {
  fetchAttendance,
  fetchAttendanceCalendar,
  fetchAttendanceSummary,
  getAttendancePhotoUrl,
  forceCloseStaleAttendance,
  correctAttendanceRecord,
  type AttendanceCalendarEmployee,
  type AttendanceCalendarLeave,
} from "./actions";
import { AttendanceCalendar } from "./attendance-calendar";
import { calculateAttendanceWorkHours } from "./attendance-summary";
import type { BranchOption } from "./_types";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppDialog,
  FormDialog,
  TextareaField,
  TextField,
} from "@/components/form";
import { Combobox } from "@/components/form/combobox";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_PHASES,
  type ChecklistPhase,
} from "./checklist-types";
import { resolveHrBranchScope } from "@/lib/hr-scope";

const attendanceCopy = messages.employee.hrAttendance;
const scheduleCopy = messages.employee.schedule;

interface AttendanceRecord {
  id: number;
  branch_id: number | null;
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

function isStaleOpenAttendanceRecord(
  record: Pick<AttendanceRecord, "date" | "check_in" | "check_out" | "shifts">,
  todayStr: string,
): boolean {
  if (!record.check_in || record.check_out) return false;
  if (!record.shifts) return record.date < todayStr;
  return isShiftEndedForBusinessDate(record.date, {
    id: 0,
    start_time: record.shifts.start_time,
    end_time: record.shifts.end_time,
  });
}

interface AttendanceSummaryRow {
  employee_id: number;
  employee_code: string;
  full_name: string;
  workdays: number;
  work_hours: number;
}

type AttendanceView = "clock" | "summary" | "calendar";
type CalendarScope = "all" | "attention";

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Nhập ngày giờ hợp lệ.");
const attendanceCorrectionSchema = z
  .object({
    checkIn: localDateTimeSchema,
    checkOut: z.union([localDateTimeSchema, z.literal("")]),
    reason: z.string().trim().min(5, "Lý do phải có ít nhất 5 ký tự."),
  })
  .refine(
    (values) =>
      values.checkOut === "" ||
      Date.parse(values.checkOut) > Date.parse(values.checkIn),
    { path: ["checkOut"], message: "Giờ ra phải sau giờ vào." },
  );
type AttendanceCorrectionValues = z.infer<typeof attendanceCorrectionSchema>;

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

interface AttendanceTableProps {
  branches: BranchOption[];
  initialBranchId?: number;
  initialBranchScope?: string;
  initialMonth?: string;
  initialView?: AttendanceView;
  initialDay?: string | null;
  initialEmployeeId?: number | null;
  initialCalendarScope?: CalendarScope;
  /** Preserve Owner IA tab (`today` / `timesheet`) across filter replaces. */
  urlTab?: string;
  /** Today tab: clock-only, hide month/view chrome. */
  todayMode?: boolean;
  routePath?: string;
  canForceClose?: boolean;
  canCorrect?: boolean;
}

export function AttendanceTable({
  branches,
  initialBranchId,
  initialBranchScope,
  initialMonth = getVNMonthString(),
  initialView = "summary",
  initialDay = null,
  initialEmployeeId = null,
  initialCalendarScope = "all",
  urlTab,
  todayMode = false,
  routePath = "/hr/attendance",
  canForceClose = false,
  canCorrect = false,
}: AttendanceTableProps) {
  const controlSize = useFormControlSize();
  const router = useRouter();
  const isCalendarDetailTouch = useIsMobile();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
  const [calendarEmployees, setCalendarEmployees] = useState<
    AttendanceCalendarEmployee[]
  >([]);
  const [calendarLeaves, setCalendarLeaves] = useState<
    AttendanceCalendarLeave[]
  >([]);
  const selectedBranch = resolveHrBranchScope(
    initialBranchScope ?? String(initialBranchId ?? "all"),
    branches,
  );
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [view, setView] = useState<AttendanceView>(initialView);
  const [selectedDay, setSelectedDay] = useState<string | null>(
    initialView === "calendar" ? initialDay : null,
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    initialView === "calendar" ? initialEmployeeId : null,
  );
  const [calendarScope, setCalendarScope] = useState<CalendarScope>(
    initialView === "calendar" ? initialCalendarScope : "all",
  );
  const [isPending, startTransition] = useTransition();

  // `nextView` rides as a parameter: the view-toggle handlers call
  // setView + loadData in the same tick, so reading `view` from the
  // closure would fetch the PREVIOUS mode and render an empty table.
  function loadData(
    branchId: string,
    month: string,
    nextView: AttendanceView = view,
    nextDay: string | null = null,
    nextEmployeeId: number | null = null,
    nextCalendarScope: CalendarScope = calendarScope,
  ) {
    setSelectedMonth(month);
    setSelectedDay(nextDay);
    setSelectedEmployeeId(nextEmployeeId);
    setCalendarScope(nextView === "calendar" ? nextCalendarScope : "all");
    const params = new URLSearchParams({
      branch: String(branchId),
      month,
      view: nextView,
    });
    if (urlTab) params.set("tab", urlTab);
    if (nextView === "calendar" && nextDay) {
      params.set("day", nextDay);
    }
    if (nextView === "calendar" && nextEmployeeId != null) {
      params.set("employee", String(nextEmployeeId));
    }
    if (nextView === "calendar" && nextCalendarScope === "attention") {
      params.set("filter", "attention");
    }
    router.replace(`${routePath}?${params.toString()}`, { scroll: false });
    startTransition(async () => {
      const numericBranchId = Number(branchId);
      const scopeInput = {
        branchId:
          Number.isSafeInteger(numericBranchId) && numericBranchId > 0
            ? numericBranchId
            : null,
        officeOnly: branchId === "office",
        month,
      };
      const viewResult =
        nextView === "summary"
          ? await fetchAttendanceSummary(scopeInput)
          : nextView === "calendar"
            ? await fetchAttendanceCalendar(scopeInput)
            : await fetchAttendance(scopeInput);

      if (viewResult.success) {
        if (nextView === "summary") {
          setSummary((viewResult.data ?? []) as AttendanceSummaryRow[]);
        } else if (nextView === "calendar") {
          const calendarData = viewResult.data as
            | {
                attendance: AttendanceRecord[];
                employees: AttendanceCalendarEmployee[];
                leaves: AttendanceCalendarLeave[];
              }
            | undefined;
          setRecords(calendarData?.attendance ?? []);
          setCalendarEmployees(calendarData?.employees ?? []);
          setCalendarLeaves(calendarData?.leaves ?? []);
        } else {
          setRecords((viewResult.data ?? []) as AttendanceRecord[]);
        }
      } else {
        toast.error(viewResult.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function selectView(nextView: AttendanceView) {
    setView(nextView);
    loadData(
      selectedBranch,
      selectedMonth,
      nextView,
      null,
      nextView === "calendar" ? selectedEmployeeId : null,
      nextView === "calendar" ? calendarScope : "all",
    );
  }

  function selectCalendarDay(date: string | null) {
    setSelectedDay(date);
    const params = new URLSearchParams({
      branch: String(selectedBranch),
      month: selectedMonth,
      view: "calendar",
    });
    if (urlTab) params.set("tab", urlTab);
    if (date) params.set("day", date);
    if (selectedEmployeeId != null) {
      params.set("employee", String(selectedEmployeeId));
    }
    if (calendarScope === "attention") {
      params.set("filter", "attention");
    }
    router.replace(`${routePath}?${params.toString()}`, { scroll: false });
  }

  function selectCalendarEmployee(employeeId: number | null) {
    setSelectedEmployeeId(employeeId);
    setSelectedDay(null);
    const params = new URLSearchParams({
      branch: String(selectedBranch),
      month: selectedMonth,
      view: "calendar",
    });
    if (urlTab) params.set("tab", urlTab);
    if (employeeId != null) params.set("employee", String(employeeId));
    if (calendarScope === "attention") {
      params.set("filter", "attention");
    }
    router.replace(`${routePath}?${params.toString()}`, { scroll: false });
  }

  function selectCalendarScope(scope: CalendarScope) {
    setCalendarScope(scope);
    setSelectedDay(null);
    const params = new URLSearchParams({
      branch: String(selectedBranch),
      month: selectedMonth,
      view: "calendar",
    });
    if (urlTab) params.set("tab", urlTab);
    if (selectedEmployeeId != null) {
      params.set("employee", String(selectedEmployeeId));
    }
    if (scope === "attention") {
      params.set("filter", "attention");
    }
    router.replace(`${routePath}?${params.toString()}`, { scroll: false });
  }

  // Initial load on mount — the tab used to open blank with a hint
  // pointing at a load button that does not exist.
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    loadData(
      selectedBranch,
      selectedMonth,
      view,
      selectedDay,
      selectedEmployeeId,
      calendarScope,
    );
  }, []);

  // Generate month options (last 6 months)
  const monthOptions = getVNMonthSequenceBack(6).map(({ date }) =>
    date.slice(0, 7),
  );
  const calendarRecords = selectedEmployeeId
    ? records.filter((record) => record.employee_id === selectedEmployeeId)
    : records;
  const employeeLeaves = selectedEmployeeId
    ? calendarLeaves.filter((leave) => leave.employee_id === selectedEmployeeId)
    : [];
  const staleOpenDates = calendarRecords
    .filter((record) => isStaleOpenAttendanceRecord(record, getVNDateString()))
    .map((record) => record.date);
  const selectedDayRecords = selectedDay
    ? calendarRecords.filter((record) => record.date === selectedDay)
    : [];
  const selectedDayLeave = selectedDay
    ? employeeLeaves.find(
        (leave) =>
          leave.start_date <= selectedDay && leave.end_date >= selectedDay,
      )
    : undefined;
  const selectedDayClosedShifts = selectedDayRecords.filter(
    (record) => record.check_out,
  ).length;
  const selectedDayOpenShifts = selectedDayRecords.filter(
    (record) => record.check_in && !record.check_out,
  ).length;
  const selectedDayWorkHours = selectedDayRecords.reduce(
    (total, record) =>
      total + calculateAttendanceWorkHours(record.check_in, record.check_out),
    0,
  );
  const selectedCalendarEmployee = calendarEmployees.find(
    (employee) => employee.id === selectedEmployeeId,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <AppToolbar
          sticky
          className="items-stretch [&>[data-slot=toolbar-group]]:w-full [&>[data-slot=separator]]:hidden sm:items-center sm:[&>[data-slot=toolbar-group]]:w-auto sm:[&>[data-slot=separator]]:block"
          filters={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              {todayMode ? null : (
                <Select
                  value={selectedMonth}
                  onValueChange={(value) =>
                    loadData(
                      selectedBranch,
                      value,
                      view,
                      null,
                      view === "calendar" ? selectedEmployeeId : null,
                    )
                  }
                >
                  <SelectTrigger
                    size={controlSize}
                    className="w-full sm:w-40"
                    aria-label="Tháng chấm công"
                  >
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
              )}
              {!todayMode && view === "calendar" ? (
                <>
                  <Combobox
                    value={selectedEmployeeId?.toString() ?? "all"}
                    onValueChange={(value) =>
                      selectCalendarEmployee(
                        value === "all" ? null : Number(value),
                      )
                    }
                    options={[
                      {
                        value: "all",
                        label: attendanceCopy.calendarAllEmployees,
                      },
                      ...calendarEmployees.map((employee) => ({
                        value: String(employee.id),
                        label:
                          employee.full_name ||
                          employee.employee_code ||
                          attendanceCopy.employeeCode,
                        hint: employee.employee_code || undefined,
                      })),
                    ]}
                    placeholder={attendanceCopy.calendarEmployeeLabel}
                    searchPlaceholder={attendanceCopy.calendarEmployeeSearch}
                    emptyMessage={attendanceCopy.calendarEmployeeEmpty}
                    aria-label={attendanceCopy.calendarEmployeeLabel}
                    triggerClassName="col-span-2 w-full sm:w-64"
                  />
                  <Select
                    value={calendarScope}
                    onValueChange={(value) => {
                      if (value === "all" || value === "attention") {
                        selectCalendarScope(value);
                      }
                    }}
                  >
                    <SelectTrigger
                      size={controlSize}
                      className="col-span-2 w-full sm:w-44"
                      aria-label={attendanceCopy.calendarScopeLabel}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {attendanceCopy.calendarScopeAll}
                      </SelectItem>
                      <SelectItem value="attention">
                        {attendanceCopy.calendarScopeAttention}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>
              ) : null}
            </div>
          }
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {todayMode ? null : (
                <ToggleGroup
                  type="single"
                  value={view}
                  onValueChange={(value) => {
                    if (
                      value === "clock" ||
                      value === "summary" ||
                      value === "calendar"
                    ) {
                      selectView(value);
                    }
                  }}
                  aria-label={attendanceCopy.viewSwitcher}
                >
                  <ToggleGroupItem value="summary" size="sm">
                    {attendanceCopy.summaryView}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="calendar" size="sm">
                    {attendanceCopy.calendarView}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="clock" size="sm">
                    {attendanceCopy.clockView}
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              {isPending ? <Spinner /> : null}
            </div>
          }
        />
        {todayMode ? null : (
          <p className="text-sm text-muted-foreground">
            {attendanceCopy.workdayRule}
          </p>
        )}
      </div>

      {view === "summary" ? (
        <AppSection
          title={messages.hr.client.attendanceTitle}
          contentFlush
          contentScroll
        >
          <SummaryView data={summary} />
        </AppSection>
      ) : view === "clock" ? (
        <AppSection
          title={messages.hr.client.attendanceTitle}
          contentFlush
          contentScroll
        >
          <DetailView
            branchId={
              Number(selectedBranch) > 0 ? Number(selectedBranch) : null
            }
            data={records}
            compact={todayMode}
            todayColumns={todayMode}
            canForceClose={canForceClose}
            canCorrect={canCorrect}
            onMutated={() => loadData(selectedBranch, selectedMonth, "clock")}
          />
        </AppSection>
      ) : (
        <div className="flex flex-col gap-4">
          <AppSection
            title={attendanceCopy.calendarTitle}
            description={
              calendarScope === "attention"
                ? attendanceCopy.calendarAttentionDescription
                : attendanceCopy.calendarDescription
            }
          >
            <AttendanceCalendar
              month={selectedMonth}
              records={calendarRecords}
              leaves={employeeLeaves}
              selectedDate={selectedDay}
              onSelectDate={selectCalendarDay}
              showShiftNames={selectedEmployeeId !== null}
              attentionOnly={calendarScope === "attention"}
              staleOpenDates={staleOpenDates}
            />
          </AppSection>
          <Sheet
            open={selectedDay !== null}
            onOpenChange={(open) => {
              if (!open) selectCalendarDay(null);
            }}
          >
            <SheetContent
              side={isCalendarDetailTouch ? "bottom" : "right"}
              className="max-h-dvh-95 overflow-hidden bg-background p-0 data-[side=right]:lg:w-1/2 data-[side=right]:lg:max-w-none"
            >
              {selectedDay ? (
                <>
                  <SheetHeader>
                    <SheetTitle>
                      {attendanceCopy.calendarDetailTitle(
                        formatVNBusinessDate(selectedDay),
                      )}
                    </SheetTitle>
                    <SheetDescription>
                      {selectedCalendarEmployee
                        ? `${selectedCalendarEmployee.full_name || selectedCalendarEmployee.employee_code} · ${attendanceCopy.calendarDetailDescription}`
                        : attendanceCopy.calendarDetailDescription}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                    <div className="flex flex-col gap-3">
                      <Frame className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <Badge variant="outline">
                          {attendanceCopy.calendarActualSummary(
                            selectedDayClosedShifts,
                            countCompletedShiftWorkdays(
                              selectedDayClosedShifts,
                            ),
                            selectedDayWorkHours,
                          )}
                        </Badge>
                        {selectedDayOpenShifts > 0 ? (
                          <Badge variant="warning">
                            {attendanceCopy.openShiftCount(
                              selectedDayOpenShifts,
                            )}
                          </Badge>
                        ) : null}
                        {selectedDayLeave ? (
                          <Badge
                            variant={
                              selectedDayLeave.status === "approved"
                                ? "info"
                                : "warning"
                            }
                          >
                            {selectedDayLeave.status === "approved"
                              ? scheduleCopy.leaveApproved
                              : scheduleCopy.leavePending}
                          </Badge>
                        ) : null}
                      </Frame>
                      <DetailView
                        branchId={
                          Number(selectedBranch) > 0
                            ? Number(selectedBranch)
                            : null
                        }
                        data={selectedDayRecords}
                        compact
                        canForceClose={canForceClose}
                        canCorrect={canCorrect}
                        onMutated={() =>
                          loadData(
                            selectedBranch,
                            selectedMonth,
                            "calendar",
                            selectedDay,
                            selectedEmployeeId,
                          )
                        }
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      )}
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
  compact = false,
  todayColumns = false,
  canForceClose,
  canCorrect,
  onMutated,
}: {
  branchId: number | null;
  data: AttendanceRecord[];
  compact?: boolean;
  todayColumns?: boolean;
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

  if (data.length === 0) {
    return (
      <AppEmptyState
        title={attendanceCopy.detailEmptyTitle}
        description={attendanceCopy.detailEmptyDescription}
        icon={<IconListChecks />}
      />
    );
  }

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
