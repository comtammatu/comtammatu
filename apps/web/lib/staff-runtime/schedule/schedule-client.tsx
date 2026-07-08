"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { formatVND } from "@comtammatu/shared/format";
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
  fetchMySchedule,
  type ScheduleAttendance,
  type ScheduleLeave,
  type ScheduleMonthData,
} from "./actions";
import {
  formatISODateParts,
  formatVNTime,
  getVNDateString,
  getVNMonthEndDateString,
  getVNMonthStartDateString,
  parseISODateParts,
  shiftVNMonth,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  getStatusBadgeMeta,
  getStatusDotClassName,
  StatusBadge,
} from "@/components/status-badge";
import { countCompletedShiftWorkdays } from "../_lib/workday-math";

const copy = messages.employee.schedule;

interface CalendarCell {
  dateStr: string | null;
  dayNumber: number | null;
  isToday: boolean;
}

interface ScheduleClientProps {
  initialData: ScheduleMonthData;
  initialMonthStart: string;
  leaveHref?: string;
  monthlySalary?: number;
}

function formatDate(dateStr: string): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return dateStr;
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
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
  return `${start.slice(0, 5)} - ${end ? end.slice(0, 5) : "—"}`;
}

function formatDayCount(count: number): string {
  return Number.isInteger(count)
    ? String(count)
    : count.toFixed(1).replace(".", ",");
}

function getMonthStartForOffset(monthStartStr: string, delta: number): string {
  const parts = parseISODateParts(monthStartStr);
  if (!parts) return getVNMonthStartDateString();
  const shifted = shiftVNMonth(parts.year, parts.month, delta);
  return formatISODateParts({ ...shifted, day: 1 });
}

function generateMonthCalendarCells(monthStartStr: string): CalendarCell[] {
  const parts = parseISODateParts(monthStartStr);
  if (!parts) return generateMonthCalendarCells(getVNMonthStartDateString());

  const firstDate = new Date(Date.UTC(parts.year, parts.month - 1, 1, 5, 0, 0));
  const mondayFirstOffset = (firstDate.getUTCDay() + 6) % 7;
  const daysInMonth = Number(
    getVNMonthEndDateString(parts.year, parts.month).slice(-2),
  );
  const totalCells = Math.max(
    35,
    Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7,
  );
  const todayStr = getVNDateString();

  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - mondayFirstOffset + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return { dateStr: null, dayNumber: null, isToday: false };
    }

    const dateStr = formatISODateParts({ ...parts, day: dayNumber });
    return {
      dateStr,
      dayNumber,
      isToday: dateStr === todayStr,
    };
  });
}

function chunkCalendarRows(cells: CalendarCell[]): CalendarCell[][] {
  const rows: CalendarCell[][] = [];
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

type LeaveDayStatus = ScheduleLeave["status"];

function addDaysToISODate(dateStr: string, days: number): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return dateStr;
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return shifted.toISOString().slice(0, 10);
}

function expandLeavesByDate(
  leaves: ScheduleLeave[],
  monthStartStr: string,
  monthEndStr: string,
): Map<string, LeaveDayStatus> {
  const leaveByDate = new Map<string, LeaveDayStatus>();
  for (const leave of leaves) {
    const from =
      leave.start_date > monthStartStr ? leave.start_date : monthStartStr;
    const to = leave.end_date < monthEndStr ? leave.end_date : monthEndStr;
    for (
      let dateStr = from;
      dateStr <= to;
      dateStr = addDaysToISODate(dateStr, 1)
    ) {
      // "approved" wins over "pending" when two requests overlap the same day.
      if (leave.status === "approved" || !leaveByDate.has(dateStr)) {
        leaveByDate.set(dateStr, leave.status);
      }
    }
  }
  return leaveByDate;
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
  const leaveByDate = expandLeavesByDate(
    data.leaves,
    monthStartStr,
    monthEndStr,
  );

  return { attendanceByDate, leaveByDate };
}

const EMPTY_MONTH: ScheduleMonthData = {
  attendance: [],
  leaves: [],
  annualLeaveBalance: null,
  monthlyAnnualLeaveDays: 0,
};
const SCHEDULE_SKELETON_FIXTURE_MONTH = "2026-01-01";
const SCHEDULE_SKELETON_FIXTURE_ATTENDANCE: ScheduleAttendance[] = [
  {
    date: "2026-01-05",
    check_in: "2026-01-05T00:05:00.000Z",
    check_out: "2026-01-05T07:00:00.000Z",
    status: "present",
    shift_name: "Ca s\u00e1ng",
    start_time: "06:00",
    end_time: "13:00",
  },
  {
    date: "2026-01-05",
    check_in: "2026-01-05T09:05:00.000Z",
    check_out: null,
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
  monthlyAnnualLeaveDays: 2,
};

function ScheduleSkeletonFallback() {
  return (
    <EmployeeFrame>
      <div role="grid" className="overflow-hidden">
        <div role="row" className="grid grid-cols-7 bg-muted/40">
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
    </EmployeeFrame>
  );
}

function getLeaveLabel(leave: LeaveDayStatus): string {
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
  cell: CalendarCell;
  leave: LeaveDayStatus | undefined;
  onSelectDate: (dateStr: string) => void;
  selected: boolean;
}) {
  if (!cell.dateStr || cell.dayNumber == null) {
    return (
      <div
        aria-hidden="true"
        className="aspect-square rounded-md bg-muted/30 sm:aspect-video"
      />
    );
  }

  const ariaParts = [
    formatDate(cell.dateStr),
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
    <button
      type="button"
      aria-label={ariaParts.join(". ")}
      aria-pressed={selected}
      onClick={() => {
        if (cell.dateStr) onSelectDate(cell.dateStr);
      }}
      className={cn(
        "flex aspect-square w-full flex-col gap-1 rounded-md bg-background p-1.5 text-left transition-[background-color,box-shadow,transform] duration-150 sm:aspect-video sm:p-2",
        cell.isToday && "bg-primary/5 ring-1 ring-primary/30",
        selected && "bg-info/10 shadow-sm ring-2 ring-info/40",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "font-mono text-xs font-semibold tabular-nums sm:text-sm",
            cell.isToday ? "text-primary" : "text-foreground",
          )}
        >
          {cell.dayNumber}
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
    </button>
  );
}

function ScheduleMonthCalendarTable({
  attendanceByDate,
  leaveByDate,
  monthStart,
  onSelectDate,
  selectedDate,
}: {
  attendanceByDate: Map<string, ScheduleAttendance[]>;
  leaveByDate: Map<string, LeaveDayStatus>;
  monthStart: string;
  onSelectDate: (dateStr: string) => void;
  selectedDate: string | null;
}) {
  const rows = chunkCalendarRows(generateMonthCalendarCells(monthStart));

  return (
    <EmployeeFrame className="overflow-hidden">
      <div role="grid" className="overflow-hidden">
        <div role="row" className="grid grid-cols-7 bg-muted/40">
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
                key={cell.dateStr ?? `${rowIndex}-${cellIndex}`}
                role="gridcell"
                className="border-l border-t p-1.5 align-top whitespace-normal first:border-l-0 sm:p-2"
              >
                <CalendarCellContent
                  attendances={
                    cell.dateStr
                      ? (attendanceByDate.get(cell.dateStr) ?? [])
                      : []
                  }
                  cell={cell}
                  leave={
                    cell.dateStr ? leaveByDate.get(cell.dateStr) : undefined
                  }
                  onSelectDate={onSelectDate}
                  selected={cell.dateStr === selectedDate}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </EmployeeFrame>
  );
}

function SelectedDayDetail({
  attendances,
  dateStr,
  leave,
  leaveHref,
  todayStr,
}: {
  attendances: ScheduleAttendance[];
  dateStr: string;
  leave: LeaveDayStatus | undefined;
  leaveHref: string;
  todayStr: string;
}) {
  const canRequestLeave = dateStr >= todayStr;

  return (
    <>
      <div className="px-4 pb-4">
        <EmployeeFrame pad="sm" className="flex flex-col gap-3 bg-background">
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
        </EmployeeFrame>
      </div>

      {canRequestLeave ? (
        <DrawerFooter>
          <Button
            asChild
            variant="outline"
            size="touch"
            className="w-full sm:w-fit"
          >
            <Link href={leaveHref}>
              <IconCalendarX data-icon="inline-start" />
              {copy.requestLeaveCta}
            </Link>
          </Button>
        </DrawerFooter>
      ) : null}
    </>
  );
}

export function ScheduleClient({
  initialData,
  initialMonthStart,
  leaveHref = "/br",
  monthlySalary = 0,
}: ScheduleClientProps) {
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

  // Per-shift (D027): each completed shift contributes 0.5 workday.
  const shiftCountByDate = new Map<string, number>();
  for (const item of monthData.attendance) {
    if (!item.check_out) continue;
    shiftCountByDate.set(item.date, (shiftCountByDate.get(item.date) ?? 0) + 1);
  }
  let workdaysCount = 0;
  for (const count of shiftCountByDate.values()) {
    workdaysCount += countCompletedShiftWorkdays(count);
  }
  const leaveDaysCount = monthData.monthlyAnnualLeaveDays;
  const hasMonthlySalary = monthlySalary > 0;
  const estimatedPay = hasMonthlySalary
    ? (workdaysCount * monthlySalary) / 27
    : null;
  const annualLeaveBalance = monthData.annualLeaveBalance;

  return (
    <>
      <EmployeePanel contentClassName="gap-3">
        <EmployeeControlBar>
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
        </EmployeeControlBar>

        <EmployeeStatusStrip
          className="grid-cols-2"
          items={[
            {
              label: copy.summaryWorkdays,
              value: formatDayCount(workdaysCount),
              mono: true,
            },
            {
              label: copy.summaryMonthlyLeaveDays,
              value: formatDayCount(leaveDaysCount),
              muted: leaveDaysCount === 0,
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
              <ScheduleMonthCalendarTable
                {...createScheduleMaps(
                  SCHEDULE_SKELETON_FIXTURE,
                  SCHEDULE_SKELETON_FIXTURE_MONTH,
                )}
                monthStart={SCHEDULE_SKELETON_FIXTURE_MONTH}
                onSelectDate={() => undefined}
                selectedDate={null}
              />
            }
            fallback={<ScheduleSkeletonFallback />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <ScheduleMonthCalendarTable
              attendanceByDate={attendanceByDate}
              leaveByDate={leaveByDate}
              monthStart={monthStart}
              onSelectDate={setSelectedDate}
              selectedDate={selectedDate}
            />
          </AppBoneyardSkeleton>
        )}
      </EmployeePanel>

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
