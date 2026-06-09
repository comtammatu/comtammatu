"use client";

import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
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
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import { EmployeePanel } from "../components/employee-page";
import {
  fetchMySchedule,
  type ScheduleAttendance,
  type ScheduleMonthData,
  type ScheduleShift,
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

function formatShiftTime(shift: ScheduleShift): string {
  return `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}`;
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
  return ATTENDANCE_STATUS_LABELS[attendance.status] ?? attendance.status;
}

function getAttendanceVariant(
  attendance: ScheduleAttendance,
): BadgeProps["variant"] {
  return ATTENDANCE_STATUS_VARIANTS[attendance.status] ?? "outline";
}

const EMPTY_MONTH: ScheduleMonthData = { shifts: [], attendance: [] };
const SCHEDULE_SKELETON_FIXTURE_MONTH = "2026-01-01";
const SCHEDULE_SKELETON_FIXTURE_SHIFTS: ScheduleShift[] = [
  {
    date: "2026-01-05",
    shift_name: "Ca s\u00e1ng",
    start_time: "07:00",
    end_time: "14:00",
  },
  {
    date: "2026-01-06",
    shift_name: "Ca chi\u1ec1u",
    start_time: "14:00",
    end_time: "22:00",
  },
  {
    date: "2026-01-15",
    shift_name: "Ca s\u00e1ng",
    start_time: "07:00",
    end_time: "14:00",
  },
  {
    date: "2026-01-30",
    shift_name: "Ca t\u1ed1i",
    start_time: "16:00",
    end_time: "23:00",
  },
];
const SCHEDULE_SKELETON_FIXTURE_ATTENDANCE: ScheduleAttendance[] = [
  {
    date: "2026-01-05",
    check_in: "2026-01-05T00:05:00.000Z",
    check_out: "2026-01-05T07:00:00.000Z",
    status: "present",
  },
  {
    date: "2026-01-06",
    check_in: "2026-01-06T07:10:00.000Z",
    check_out: null,
    status: "late",
  },
];

function ScheduleSkeletonFallback() {
  return (
    <div className="rounded-md border bg-card">
      <Table className="table-fixed border-collapse">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {copy.monthWeekdays.map((day) => (
              <TableHead
                key={day}
                className="h-9 border-l text-center text-xs font-medium whitespace-normal first:border-l-0"
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
                  <div className="flex min-h-24 flex-col gap-2 rounded-md p-2">
                    <Skeleton className="h-4 w-6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
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

function CalendarCellContent({
  attendance,
  cell,
  shift,
}: {
  attendance: ScheduleAttendance | undefined;
  cell: CalendarCell;
  shift: ScheduleShift | undefined;
}) {
  if (!cell.dateStr || cell.dayNumber == null) {
    return (
      <div aria-hidden="true" className="min-h-24 rounded-md bg-muted/30" />
    );
  }

  const hasClock = Boolean(attendance?.check_in || attendance?.check_out);

  return (
    <div
      className={cn(
        "flex min-h-24 flex-col gap-1 rounded-md p-2",
        cell.isToday && "bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
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

      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={cn(
            "text-xs font-medium leading-5",
            !shift && "text-muted-foreground",
          )}
        >
          {shift?.shift_name ?? copy.rest}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {shift ? formatShiftTime(shift) : "\u2014"}
        </span>
      </div>

      <div className="mt-auto flex min-w-0 flex-col gap-1">
        {attendance ? (
          <>
            <Badge
              variant={getAttendanceVariant(attendance)}
              className="max-w-full truncate"
            >
              {getAttendanceLabel(attendance)}
            </Badge>
            {hasClock ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {copy.checkInShort} {formatTime(attendance.check_in)} {"\u00b7"}{" "}
                {copy.checkOutShort} {formatTime(attendance.check_out)}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {copy.noAttendance}
          </span>
        )}
      </div>
    </div>
  );
}

function ScheduleMonthCalendarTable({
  data,
  monthStart,
}: {
  data: ScheduleMonthData;
  monthStart: string;
}) {
  const shiftsByDate = new Map<string, ScheduleShift>();
  for (const shift of data.shifts) {
    shiftsByDate.set(shift.date, shift);
  }

  const attendanceByDate = new Map<string, ScheduleAttendance>();
  for (const attendance of data.attendance) {
    attendanceByDate.set(attendance.date, attendance);
  }

  const rows = chunkCalendarRows(generateMonthCalendarCells(monthStart));

  return (
    <div className="rounded-md border bg-card">
      <Table className="table-fixed border-collapse">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {copy.monthWeekdays.map((day) => (
              <TableHead
                key={day}
                className="h-9 border-l text-center text-xs font-medium whitespace-normal first:border-l-0"
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
                    attendance={
                      cell.dateStr
                        ? attendanceByDate.get(cell.dateStr)
                        : undefined
                    }
                    cell={cell}
                    shift={
                      cell.dateStr ? shiftsByDate.get(cell.dateStr) : undefined
                    }
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

export function ScheduleClient({
  initialData,
  initialMonthStart,
}: ScheduleClientProps) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [monthData, setMonthData] = useState<ScheduleMonthData>(initialData);
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
        setMonthData(result.data ?? EMPTY_MONTH);
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

  return (
    <>
      <EmployeePanel title={copy.monthPanelTitle}>
        <div className="flex items-center justify-between gap-2">
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

          <div className="flex flex-1 flex-col items-center gap-1 text-center">
            <p className="font-heading text-base font-semibold">
              {formatMonthTitle(monthStart)}
            </p>
            <p className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
              {monthRangeLabel}
            </p>
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
              <span className="text-xs font-medium text-primary">
                {copy.currentMonth}
              </span>
            )}
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
        </div>
      </EmployeePanel>

      {error ? (
        <EmployeePanel
          title={copy.loadError}
          description={error}
          tone="destructive"
        >
          <div className="flex">
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
        </EmployeePanel>
      ) : (
        <EmployeePanel title={copy.monthListTitle}>
          <AppBoneyardSkeleton
            name="employee-schedule-month"
            loading={isPending}
            fixture={
              <ScheduleMonthCalendarTable
                data={{
                  shifts: SCHEDULE_SKELETON_FIXTURE_SHIFTS,
                  attendance: SCHEDULE_SKELETON_FIXTURE_ATTENDANCE,
                }}
                monthStart={SCHEDULE_SKELETON_FIXTURE_MONTH}
              />
            }
            fallback={<ScheduleSkeletonFallback />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <ScheduleMonthCalendarTable
              data={monthData}
              monthStart={monthStart}
            />
          </AppBoneyardSkeleton>
        </EmployeePanel>
      )}
    </>
  );
}
