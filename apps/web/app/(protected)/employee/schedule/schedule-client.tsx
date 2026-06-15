"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  CalendarX as IconCalendarX,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import { EmployeePanel, EmployeeStatusStrip } from "../components/employee-page";
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

const copy = messages.employee.schedule;

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "C\u00f3 m\u1eb7t",
  late: "\u0110i tr\u1ec5",
  absent: "V\u1eafng",
  half_day: "N\u1eeda ng\u00e0y",
};

const ATTENDANCE_STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  present: "success",
  late: "warning",
  absent: "destructive",
  half_day: "info",
};

const ATTENDANCE_DOT_CLASS_NAMES: Record<string, string> = {
  present: "bg-success",
  late: "bg-warning",
  absent: "bg-destructive",
  half_day: "bg-info",
};

interface CalendarCell {
  dateStr: string | null;
  dayNumber: number | null;
  isToday: boolean;
}

interface ScheduleClientProps {
  initialData: ScheduleMonthData;
  initialMonthStart: string;
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

function formatShiftWindow(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "—";
  return `${start.slice(0, 5)} - ${end ? end.slice(0, 5) : "—"}`;
}

function getMonthStartForOffset(monthStartStr: string, delta: number): string {
  const parts = parseISODateParts(monthStartStr);
  if (!parts) return getVNMonthStartDateString();
  const shifted = shiftVNMonth(parts.year, parts.month, delta);
  return formatISODateParts({ ...shifted, day: 1 });
}

function isDateInViewedMonth(dateStr: string, monthStartStr: string): boolean {
  const dateParts = parseISODateParts(dateStr);
  const monthParts = parseISODateParts(monthStartStr);
  return Boolean(
    dateParts &&
    monthParts &&
    dateParts.year === monthParts.year &&
    dateParts.month === monthParts.month,
  );
}

function getDefaultSelectedDate(
  monthStartStr: string,
  data: ScheduleMonthData,
): string {
  const todayStr = getVNDateString();
  if (isDateInViewedMonth(todayStr, monthStartStr)) return todayStr;

  const firstActiveDate = data.attendance
    .map((attendance) => attendance.date)
    .filter((dateStr) => isDateInViewedMonth(dateStr, monthStartStr))
    .sort()[0];

  return firstActiveDate ?? monthStartStr;
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
  return ATTENDANCE_STATUS_LABELS[attendance.status] ?? attendance.status;
}

function getAttendanceVariant(
  attendance: ScheduleAttendance,
): BadgeProps["variant"] {
  return ATTENDANCE_STATUS_VARIANTS[attendance.status] ?? "outline";
}

function getAttendanceDotClassName(attendance: ScheduleAttendance): string {
  return ATTENDANCE_DOT_CLASS_NAMES[attendance.status] ?? "bg-muted-foreground";
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
  // Per-shift (D027): a day can hold the morning and the evening record.
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
};

function ScheduleSkeletonFallback() {
  return (
    <div className="rounded-md border bg-card">
      <Table className="table-fixed border-collapse">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {copy.monthWeekdays.map((day) => (
              <TableHead
                key={day}
                className="h-8 border-l text-center text-2xs font-medium whitespace-normal first:border-l-0 sm:h-9 sm:text-xs"
              >
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <TableRow key={rowIndex} className="hover:bg-transparent">
              {Array.from({ length: 7 }).map((_, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className="border-l border-t p-1 align-top whitespace-normal first:border-l-0"
                >
                  <div className="flex aspect-square flex-col gap-2 rounded-md p-1 sm:aspect-video sm:p-2">
                    <Skeleton className="h-4 w-6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="hidden h-3 w-3/4 sm:block" />
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
        "flex aspect-square w-full flex-col gap-0.5 rounded-md bg-background p-1 text-left transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px motion-safe:hover:-translate-y-px sm:aspect-video sm:gap-1 sm:p-2",
        cell.isToday && "bg-primary/5 ring-1 ring-primary/30",
        selected &&
          "bg-info/10 shadow-sm ring-2 ring-info/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
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

      <div className="mt-auto flex min-w-0 flex-col gap-0.5">
        {attendances.map((att, index) => (
          <div key={index} className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                getAttendanceDotClassName(att),
              )}
              aria-hidden="true"
            />
            <span className="hidden min-w-0 truncate text-2xs leading-4 text-muted-foreground sm:inline">
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
            <span className="hidden min-w-0 truncate text-2xs leading-4 text-muted-foreground sm:inline">
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
  selectedDate: string;
}) {
  const rows = chunkCalendarRows(generateMonthCalendarCells(monthStart));

  return (
    <div className="rounded-md border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      <Table className="table-fixed border-collapse">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {copy.monthWeekdays.map((day) => (
              <TableHead
                key={day}
                className="h-8 border-l text-center text-2xs font-medium whitespace-normal first:border-l-0 sm:h-9 sm:text-xs"
                scope="col"
              >
                {day}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex} className="hover:bg-transparent">
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={cell.dateStr ?? `${rowIndex}-${cellIndex}`}
                  className="border-l border-t p-1 align-top whitespace-normal first:border-l-0"
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
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SelectedDayDetail({
  attendances,
  dateStr,
  leave,
}: {
  attendances: ScheduleAttendance[];
  dateStr: string;
  leave: LeaveDayStatus | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold">
            {copy.selectedDayTitle}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(dateStr)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {leave ? (
            <Badge variant={leave === "approved" ? "info" : "outline"}>
              {getLeaveLabel(leave)}
            </Badge>
          ) : null}
          {dateStr === getVNDateString() ? (
            <Badge variant="outline">{copy.today}</Badge>
          ) : null}
        </div>
      </div>

      {attendances.length === 0 ? (
        <p className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
          {copy.noAttendance}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {attendances.map((att, index) => {
            const hasClock = Boolean(att.check_in || att.check_out);
            return (
              <div
                key={index}
                className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {att.shift_name ?? copy.rowShift}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatShiftWindow(att.start_time, att.end_time)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {hasClock
                      ? `${copy.checkInShort} ${formatTime(att.check_in)} · ${copy.checkOutShort} ${formatTime(att.check_out)}`
                      : "—"}
                  </span>
                  <Badge variant={getAttendanceVariant(att)}>
                    {getAttendanceLabel(att)}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        asChild
        variant="outline"
        size="touch"
        className="w-full sm:w-fit"
      >
        <Link href="/employee/leave">
          <IconCalendarX data-icon="inline-start" />
          {copy.requestLeaveCta}
        </Link>
      </Button>
    </div>
  );
}

export function ScheduleClient({
  initialData,
  initialMonthStart,
}: ScheduleClientProps) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [monthData, setMonthData] = useState<ScheduleMonthData>(initialData);
  const [selectedDate, setSelectedDate] = useState(() =>
    getDefaultSelectedDate(initialMonthStart, initialData),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentMonthStart = getVNMonthStartDateString();
  const isCurrentMonth = monthStart === currentMonthStart;
  const monthParts = parseISODateParts(monthStart);
  const monthEndStr = monthParts
    ? getVNMonthEndDateString(monthParts.year, monthParts.month)
    : monthStart;
  const monthRangeLabel =
    monthEndStr === monthStart
      ? formatDate(monthStart)
      : `${formatDate(monthStart)} - ${formatDate(monthEndStr)}`;

  function loadMonth(newMonthStart: string) {
    setMonthStart(newMonthStart);
    setError(null);
    startTransition(async () => {
      const result = await fetchMySchedule(newMonthStart);
      if (result.success) {
        const nextData = result.data ?? EMPTY_MONTH;
        setMonthData(nextData);
        setSelectedDate(getDefaultSelectedDate(newMonthStart, nextData));
      } else {
        setError(result.error ?? copy.loadError);
        setMonthData(EMPTY_MONTH);
        setSelectedDate(getDefaultSelectedDate(newMonthStart, EMPTY_MONTH));
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
  const selectedAttendance = attendanceByDate.get(selectedDate) ?? [];
  const selectedLeave = leaveByDate.get(selectedDate);

  // Per-shift (D027): 2 ca/ngày = 1 công, 1 ca = 0.5.
  const shiftCountByDate = new Map<string, number>();
  for (const item of monthData.attendance) {
    shiftCountByDate.set(item.date, (shiftCountByDate.get(item.date) ?? 0) + 1);
  }
  let workdaysCount = 0;
  for (const count of shiftCountByDate.values()) {
    workdaysCount += Math.min(count, 2) * 0.5;
  }
  const openShiftsCount = monthData.attendance.filter(
    (item) => !item.check_out,
  ).length;
  const leaveDaysCount = monthData.leaves.filter(
    (item) => item.status === "approved",
  ).length;

  return (
    <EmployeePanel
      title={formatMonthTitle(monthStart)}
      description={monthRangeLabel}
      headerHint={
        isCurrentMonth ? (
          <Badge variant="outline">{copy.currentMonth}</Badge>
        ) : undefined
      }
      contentClassName="gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="touch"
          className="w-12 px-0 transition-transform duration-150 active:translate-y-px"
          onClick={goToPrevMonth}
          disabled={isPending}
          aria-label={copy.prevMonth}
        >
          <IconChevronLeft />
        </Button>
        {!isCurrentMonth ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={goToCurrentMonth}
            disabled={isPending}
          >
            {copy.currentMonth}
          </Button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {copy.calendarAxisLabel}
          </span>
        )}
        <Button
          variant="outline"
          size="touch"
          className="w-12 px-0 transition-transform duration-150 active:translate-y-px"
          onClick={goToNextMonth}
          disabled={isPending}
          aria-label={copy.nextMonth}
        >
          <IconChevronRight />
        </Button>
      </div>

      <EmployeeStatusStrip
        items={[
          { label: copy.summaryWorkdays, value: String(workdaysCount) },
          {
            label: copy.summaryOpenShifts,
            value: String(openShiftsCount),
            muted: openShiftsCount === 0,
          },
          {
            label: copy.summaryLeaveDays,
            value: String(leaveDaysCount),
            muted: leaveDaysCount === 0,
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
              selectedDate={getDefaultSelectedDate(
                SCHEDULE_SKELETON_FIXTURE_MONTH,
                SCHEDULE_SKELETON_FIXTURE,
              )}
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
          <SelectedDayDetail
            key={selectedDate}
            attendances={selectedAttendance}
            dateStr={selectedDate}
            leave={selectedLeave}
          />
        </AppBoneyardSkeleton>
      )}
    </EmployeePanel>
  );
}
