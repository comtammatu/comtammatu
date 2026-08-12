"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { formatDecimal, formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import {
  CalendarX as IconCalendarX,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import {
  EmployeeControlBar,
  EmployeeFrame,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/staff-runtime-page";
import {
  BranchOperatorControlBar,
  BranchOperatorFrame,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  fetchMySchedule,
  type ScheduleAttendance,
  type ScheduleLeave,
  type ScheduleMonthData,
} from "./actions";
import {
  formatISODateParts,
  formatVNBusinessDate,
  formatVNClockTime,
  formatVNTime,
  getVNDateString,
  getVNMonthCalendarCells,
  getVNMonthEndDateString,
  getVNMonthStartDateString,
  parseISODateParts,
  shiftVNMonth,
  type VNMonthCalendarCell,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  expandLeaveRangesByDate,
  type CalendarLeaveStatus,
} from "@lib/hr/leave-calendar";
import {
  getStatusBadgeMeta,
  getStatusDotClassName,
  StatusBadge,
} from "@/components/status-badge";
import { sumShiftWorkdaysFromAttendanceRecords } from "../_lib/workday-math";

const copy = messages.employee.schedule;

interface ScheduleClientProps {
  initialData: ScheduleMonthData;
  initialMonthStart: string;
  leaveHref: string;
  monthlySalary?: number;
  plane?: SchedulePlane;
}

type ScheduleFrameComponent = (
  props: ComponentProps<"div"> & { pad?: "none" | "sm" },
) => ReactNode;
type SchedulePanelComponent = (props: {
  children: ReactNode;
  contentClassName?: string;
  className?: string;
}) => ReactNode;
type ScheduleControlBarComponent = (
  props: ComponentProps<"div"> & { children: ReactNode },
) => ReactNode;
type ScheduleStatusStripComponent = (props: {
  items: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
    mono?: boolean;
  }>;
  className?: string;
}) => ReactNode;
type SchedulePlanePrimitives = {
  Panel: SchedulePanelComponent;
  ControlBar: ScheduleControlBarComponent;
  StatusStrip: ScheduleStatusStripComponent;
  Frame: ScheduleFrameComponent;
};

export type SchedulePlane = "employee" | "branch";

const EMPLOYEE_SCHEDULE_PRIMITIVES: SchedulePlanePrimitives = {
  Panel: EmployeePanel,
  ControlBar: EmployeeControlBar,
  StatusStrip: EmployeeStatusStrip,
  Frame: EmployeeFrame,
};

const BRANCH_SCHEDULE_PRIMITIVES: SchedulePlanePrimitives = {
  Panel: BranchOperatorPanel,
  ControlBar: BranchOperatorControlBar,
  StatusStrip: BranchOperatorStatusStrip,
  Frame: BranchOperatorFrame,
};

function formatDate(dateStr: string): string {
  return formatVNBusinessDate(dateStr);
}

function formatMonthTitle(monthStartStr: string): string {
  const parts = parseISODateParts(monthStartStr);
  if (!parts) return monthStartStr;
  return `${copy.monthLabel} ${parts.month}/${parts.year}`;
}

function formatTime(iso: string | null | undefined): string {
  return iso ? formatVNTime(iso) : "\u2014";
}

function formatShiftWindow(start: string | null, end: string | null): string {
  if (!start) return "—";
  return `${formatVNClockTime(start)} - ${formatVNClockTime(end)}`;
}

function formatDayCount(count: number): string {
  return formatDecimal(count, 1);
}

function getMonthStartForOffset(monthStartStr: string, delta: number): string {
  const parts = parseISODateParts(monthStartStr);
  if (!parts) return getVNMonthStartDateString();
  const shifted = shiftVNMonth(parts.year, parts.month, delta);
  return formatISODateParts({ ...shifted, day: 1 });
}

function chunkCalendarRows(
  cells: VNMonthCalendarCell[],
): VNMonthCalendarCell[][] {
  const rows: VNMonthCalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }
  return rows;
}

function getAttendanceLabel(attendance: ScheduleAttendance): string {
  return getStatusBadgeMeta("attendance", attendance.status).label;
}

function getAttendanceDotClassName(attendance: ScheduleAttendance): string {
  return getStatusDotClassName("attendance", attendance.status);
}

function createScheduleMaps(data: ScheduleMonthData, monthStartStr: string) {
  // Per-shift (D027): a day can hold multiple named shift records.
  const attendanceByDate = new Map<string, ScheduleAttendance[]>();
  for (const attendance of data.attendance) {
    const list = attendanceByDate.get(attendance.date) ?? [];
    list.push(attendance);
    attendanceByDate.set(attendance.date, list);
  }

  const monthParts = parseISODateParts(monthStartStr);
  const monthEndStr = monthParts
    ? getVNMonthEndDateString(monthParts.year, monthParts.month)
    : monthStartStr;
  const leaveByDate = expandLeaveRangesByDate(
    data.leaves.map((leave) => ({
      startDate: leave.start_date,
      endDate: leave.end_date,
      status: leave.status,
    })),
    monthStartStr,
    monthEndStr,
  );

  return { attendanceByDate, leaveByDate };
}

const EMPTY_MONTH: ScheduleMonthData = {
  attendance: [],
  leaves: [],
  annualLeaveBalance: null,
  monthlyLeaveBalance: null,
  standardWorkdays: 26,
};
const SCHEDULE_SKELETON_FIXTURE_MONTH = "2026-01-01";
const SCHEDULE_SKELETON_FIXTURE_ATTENDANCE: ScheduleAttendance[] = [
  {
    date: "2026-01-05",
    check_in: "2026-01-05T00:05:00.000Z",
    check_out: "2026-01-05T07:00:00.000Z",
    scheduled_start_at: "2026-01-04T23:00:00.000Z",
    scheduled_end_at: "2026-01-05T06:00:00.000Z",
    status: "present",
    shift_name: "Ca s\u00e1ng",
    start_time: "06:00",
    end_time: "13:00",
  },
  {
    date: "2026-01-05",
    check_in: "2026-01-05T09:05:00.000Z",
    check_out: null,
    scheduled_start_at: "2026-01-05T09:00:00.000Z",
    scheduled_end_at: "2026-01-05T14:00:00.000Z",
    status: "present",
    shift_name: "Ca chi\u1ec1u",
    start_time: "16:00",
    end_time: "21:00",
  },
];
const SCHEDULE_SKELETON_FIXTURE_LEAVES: ScheduleLeave[] = [
  { start_date: "2026-01-20", end_date: "2026-01-21", status: "approved" },
];
const SCHEDULE_SKELETON_FIXTURE: ScheduleMonthData = {
  attendance: SCHEDULE_SKELETON_FIXTURE_ATTENDANCE,
  leaves: SCHEDULE_SKELETON_FIXTURE_LEAVES,
  annualLeaveBalance: null,
  monthlyLeaveBalance: null,
  standardWorkdays: 26,
};

function ScheduleSkeletonFallback({
  Frame,
}: {
  Frame: ScheduleFrameComponent;
}) {
  return (
    <Frame>
      <div className="overflow-x-auto overscroll-x-contain">
        <div role="grid" className="min-w-[28rem] overflow-hidden">
          <div role="row" className="grid grid-cols-7 bg-muted/30">
            {copy.monthWeekdays.map((day) => (
              <div
                key={day}
                role="columnheader"
                className="flex h-8 items-center justify-center border-l text-center text-xs font-medium whitespace-normal first:border-l-0 sm:h-9"
              >
                {day}
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} role="row" className="grid grid-cols-7">
              {Array.from({ length: 7 }).map((_, cellIndex) => (
                <div
                  key={cellIndex}
                  role="gridcell"
                  className="border-l border-t p-1 align-top whitespace-normal first:border-l-0"
                >
                  <div className="flex aspect-square flex-col gap-2 rounded-md p-1 sm:aspect-video sm:p-2">
                    <Skeleton className="h-4 w-6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="hidden h-3 w-3/4 sm:block" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function getLeaveLabel(leave: CalendarLeaveStatus): string {
  return leave === "approved" ? copy.leaveApproved : copy.leavePending;
}

function CalendarCellContent({
  attendances,
  cell,
  leave,
  onSelectDate,
  selected,
}: {
  attendances: ScheduleAttendance[];
  cell: VNMonthCalendarCell;
  leave: CalendarLeaveStatus | undefined;
  onSelectDate: (dateStr: string) => void;
  selected: boolean;
}) {
  if (!cell.date || cell.day == null) {
    return (
      <div
        aria-hidden="true"
        className="aspect-square rounded-md bg-muted/30 sm:aspect-video"
      />
    );
  }

  const ariaParts = [
    formatDate(cell.date),
    attendances.length > 0
      ? attendances
          .map(
            (att) =>
              `${att.shift_name ?? copy.rowShift}: ${getAttendanceLabel(att)}`,
          )
          .join(". ")
      : copy.noAttendance,
    ...(leave ? [getLeaveLabel(leave)] : []),
  ];

  return (
    <Button
      type="button"
      variant="ghost"
      size="touch"
      aria-label={ariaParts.join(". ")}
      aria-pressed={selected}
      onClick={() => {
        if (cell.date) onSelectDate(cell.date);
      }}
      className={cn(
        "aspect-square w-full flex-col items-stretch justify-start gap-1 rounded-md bg-background p-1.5 text-left transition-[background-color,box-shadow,transform] duration-150 sm:aspect-video sm:p-2",
        cell.isToday && "bg-primary/10 ring-1 ring-primary/20",
        selected && "bg-info/10 shadow-sm ring-2 ring-info/20",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "font-mono text-xs font-semibold tabular-nums sm:text-sm",
            cell.isToday ? "text-primary" : "text-foreground",
          )}
        >
          {cell.day}
        </span>
        {cell.isToday ? (
          <Badge className="hidden max-w-full truncate sm:inline-flex">
            {copy.today}
          </Badge>
        ) : null}
      </div>

      <div className="mt-auto flex min-w-0 flex-col gap-1">
        {attendances.map((att, index) => (
          <div key={index} className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                getAttendanceDotClassName(att),
              )}
              aria-hidden="true"
            />
            <span className="hidden min-w-0 truncate text-xs leading-4 text-muted-foreground sm:inline">
              {att.shift_name ?? "\u2014"}
              {att.check_in ? ` ${formatTime(att.check_in)}` : ""}
            </span>
          </div>
        ))}
        {leave ? (
          <div className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                leave === "approved" ? "bg-info" : "bg-warning",
              )}
              aria-hidden="true"
            />
            <span className="hidden min-w-0 truncate text-xs leading-4 text-muted-foreground sm:inline">
              {getLeaveLabel(leave)}
            </span>
          </div>
        ) : null}
      </div>
    </Button>
  );
}

function ScheduleMonthCalendarGrid({
  attendanceByDate,
  leaveByDate,
  Frame,
  monthStart,
  onSelectDate,
  selectedDate,
}: {
  attendanceByDate: Map<string, ScheduleAttendance[]>;
  leaveByDate: Map<string, CalendarLeaveStatus>;
  Frame: ScheduleFrameComponent;
  monthStart: string;
  onSelectDate: (dateStr: string) => void;
  selectedDate: string | null;
}) {
  const rows = chunkCalendarRows(getVNMonthCalendarCells(monthStart));

  return (
    <Frame className="overflow-hidden">
      <div className="overflow-x-auto overscroll-x-contain">
        <div role="grid" className="min-w-[28rem] overflow-hidden">
          <div role="row" className="grid grid-cols-7 bg-muted/30">
            {copy.monthWeekdays.map((day) => (
              <div
                key={day}
                role="columnheader"
                className="flex h-8 items-center justify-center border-l text-center text-xs font-medium whitespace-normal first:border-l-0 sm:h-9"
              >
                {day}
              </div>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} role="row" className="grid grid-cols-7">
              {row.map((cell, cellIndex) => (
                <div
                  key={cell.date ?? `${rowIndex}-${cellIndex}`}
                  role="gridcell"
                  className="border-l border-t p-1.5 align-top whitespace-normal first:border-l-0 sm:p-2"
                >
                  <CalendarCellContent
                    attendances={
                      cell.date
                        ? (attendanceByDate.get(cell.date) ?? [])
                        : []
                    }
                    cell={cell}
                    leave={
                      cell.date ? leaveByDate.get(cell.date) : undefined
                    }
                    onSelectDate={onSelectDate}
                    selected={cell.date === selectedDate}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function SelectedDayDetail({
  attendances,
  dateStr,
  Frame,
  leave,
  leaveHref,
  todayStr,
}: {
  attendances: ScheduleAttendance[];
  dateStr: string;
  Frame: ScheduleFrameComponent;
  leave: CalendarLeaveStatus | undefined;
  leaveHref: string;
  todayStr: string;
}) {
  const canRequestLeave = dateStr >= todayStr;

  return (
    <>
      <div className="px-4 pb-4">
        <Frame pad="sm" className="flex flex-col gap-3 bg-background">
          <div className="flex flex-wrap items-center gap-1.5">
            {leave ? (
              <Badge variant={leave === "approved" ? "info" : "outline"}>
                {getLeaveLabel(leave)}
              </Badge>
            ) : null}
            {dateStr === todayStr ? (
              <Badge variant="outline">{copy.today}</Badge>
            ) : null}
          </div>

          {attendances.length === 0 ? (
            <p className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {copy.noAttendance}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {attendances.map((att, index) => {
                const hasClock = Boolean(att.check_in || att.check_out);
                const timeText = hasClock
                  ? `${formatShiftWindow(att.start_time, att.end_time)} · ${copy.checkInShort} ${formatTime(att.check_in)} · ${copy.checkOutShort} ${formatTime(att.check_out)}`
                  : formatShiftWindow(att.start_time, att.end_time);
                return (
                  <div
                    key={index}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {att.shift_name ?? copy.noShiftForDay}
                      </p>
                      <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                        {timeText}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge domain="attendance" value={att.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Frame>
      </div>

      {canRequestLeave ? (
        <DrawerFooter>
          <Button
            variant="outline"
            size="touch"
            className="w-full sm:w-fit"
            render={<Link href={leaveHref} />}
          >
            <IconCalendarX data-icon="inline-start" />
            {copy.requestLeaveCta}
          </Button>
        </DrawerFooter>
      ) : null}
    </>
  );
}

export function ScheduleClient({
  initialData,
  initialMonthStart,
  leaveHref,
  monthlySalary = 0,
  plane = "employee",
}: ScheduleClientProps) {
  const { ControlBar, Frame, Panel, StatusStrip } =
    plane === "branch"
      ? BRANCH_SCHEDULE_PRIMITIVES
      : EMPLOYEE_SCHEDULE_PRIMITIVES;
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [monthData, setMonthData] = useState<ScheduleMonthData>(initialData);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentMonthStart = getVNMonthStartDateString();
  const isCurrentMonth = monthStart === currentMonthStart;
  const todayStr = getVNDateString();

  function loadMonth(newMonthStart: string) {
    setMonthStart(newMonthStart);
    setError(null);
    setSelectedDate(null);
    startTransition(async () => {
      const result = await fetchMySchedule(newMonthStart);
      if (result.success) {
        const nextData = result.data ?? EMPTY_MONTH;
        setMonthData(nextData);
      } else {
        setError(result.error ?? copy.loadError);
        setMonthData(EMPTY_MONTH);
      }
    });
  }

  function goToPrevMonth() {
    loadMonth(getMonthStartForOffset(monthStart, -1));
  }

  function goToNextMonth() {
    loadMonth(getMonthStartForOffset(monthStart, 1));
  }

  function goToCurrentMonth() {
    loadMonth(currentMonthStart);
  }

  const { attendanceByDate, leaveByDate } = createScheduleMaps(
    monthData,
    monthStart,
  );
  const selectedAttendance = selectedDate
    ? (attendanceByDate.get(selectedDate) ?? [])
    : [];
  const selectedLeave = selectedDate
    ? leaveByDate.get(selectedDate)
    : undefined;

  const workdaysCount = sumShiftWorkdaysFromAttendanceRecords(
    monthData.attendance.map((item) => ({
      checkIn: item.check_in,
      checkOut: item.check_out,
      scheduledStart: item.scheduled_start_at,
      scheduledEnd: item.scheduled_end_at,
    })),
  );
  const monthlyLeaveBalance = monthData.monthlyLeaveBalance;
  const hasMonthlySalary = monthlySalary > 0;
  const estimatedPay = hasMonthlySalary
    ? (workdaysCount * monthlySalary) / monthData.standardWorkdays
    : null;
  const annualLeaveBalance = monthData.annualLeaveBalance;

  return (
    <>
      <Panel contentClassName="gap-3">
        <ControlBar>
          <Button
            variant="outline"
            size="touch"
            className="w-12 px-0"
            onClick={goToPrevMonth}
            disabled={isPending}
            aria-label={copy.prevMonth}
          >
            <IconChevronLeft />
          </Button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
            <span className="font-heading min-w-0 truncate text-sm font-semibold sm:text-base">
              {formatMonthTitle(monthStart)}
            </span>
            {!isCurrentMonth ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="shrink-0 px-0 text-xs"
                onClick={goToCurrentMonth}
                disabled={isPending}
              >
                {copy.currentMonth}
              </Button>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="touch"
            className="w-12 px-0"
            onClick={goToNextMonth}
            disabled={isPending}
            aria-label={copy.nextMonth}
          >
            <IconChevronRight />
          </Button>
        </ControlBar>

        <StatusStrip
          className="grid-cols-2"
          items={[
            {
              label: copy.summaryWorkdays,
              value: formatDayCount(workdaysCount),
              mono: true,
            },
            {
              label: copy.summaryMonthlyLeaveDays,
              value: monthlyLeaveBalance
                ? `${formatDayCount(monthlyLeaveBalance.remainingDays)}/${formatDayCount(monthlyLeaveBalance.entitlementDays)}`
                : "—",
              muted: !monthlyLeaveBalance,
              mono: true,
            },
            {
              label: copy.summaryEstimatedDays,
              value: estimatedPay == null ? "—" : formatVND(estimatedPay),
              muted: !hasMonthlySalary,
              mono: true,
            },
            {
              label: copy.summaryAnnualLeaveDays,
              value: annualLeaveBalance
                ? `${formatDayCount(annualLeaveBalance.remainingDays)}/${formatDayCount(annualLeaveBalance.entitlementDays)}`
                : "—",
              muted: !annualLeaveBalance,
              mono: true,
            },
          ]}
        />

        {error ? (
          <div className="flex flex-col gap-2">
            <Alert variant="destructive">
              <AlertTitle>{copy.loadError}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              variant="outline"
              size="touch"
              className="w-full sm:w-fit"
              onClick={() => loadMonth(monthStart)}
              disabled={isPending}
            >
              <IconRefresh data-icon="inline-start" />
              {copy.retry}
            </Button>
          </div>
        ) : (
          <AppBoneyardSkeleton
            name="employee-schedule-month"
            loading={isPending}
            fixture={
              <ScheduleMonthCalendarGrid
                {...createScheduleMaps(
                  SCHEDULE_SKELETON_FIXTURE,
                  SCHEDULE_SKELETON_FIXTURE_MONTH,
                )}
                Frame={Frame}
                monthStart={SCHEDULE_SKELETON_FIXTURE_MONTH}
                onSelectDate={() => undefined}
                selectedDate={null}
              />
            }
            fallback={<ScheduleSkeletonFallback Frame={Frame} />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <ScheduleMonthCalendarGrid
              attendanceByDate={attendanceByDate}
              leaveByDate={leaveByDate}
              Frame={Frame}
              monthStart={monthStart}
              onSelectDate={setSelectedDate}
              selectedDate={selectedDate}
            />
          </AppBoneyardSkeleton>
        )}
      </Panel>

      <Drawer
        open={selectedDate !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {selectedDate ? formatDate(selectedDate) : copy.dayDetailTitle}
            </DrawerTitle>
            <DrawerDescription>
              {formatMonthTitle(monthStart)}
            </DrawerDescription>
          </DrawerHeader>
          {selectedDate ? (
            <SelectedDayDetail
              attendances={selectedAttendance}
              dateStr={selectedDate}
              Frame={Frame}
              leave={selectedLeave}
              leaveHref={leaveHref}
              todayStr={todayStr}
            />
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
