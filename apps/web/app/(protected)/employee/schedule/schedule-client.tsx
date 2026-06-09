"use client";

import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
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
  type ScheduleShift,
  type ScheduleWeekData,
} from "./actions";
import {
  addVNDateDays,
  formatVNTime,
  getVNDateString,
  getVNWeekStartDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";

const copy = messages.employee.schedule;

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "C\u00f3 m\u1eb7t",
  late: "\u0110i tr\u1ec5",
  absent: "V\u1eafng",
  half_day: "N\u1eeda ng\u00e0y",
};

function formatDate(dateStr: string): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return dateStr;
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

function formatTime(iso: string | null | undefined): string {
  return iso ? formatVNTime(iso) : "\u2014";
}

function getDayName(dateStr: string): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return "";
  const day = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 5, 0, 0),
  ).getUTCDay();
  return copy.days[day] ?? "";
}

function generateWeekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    addVNDateDays(mondayStr, index),
  );
}

const EMPTY_WEEK: ScheduleWeekData = { shifts: [], attendance: [] };
const SCHEDULE_SKELETON_FIXTURE_DATES = generateWeekDates("2026-01-05");
const SCHEDULE_SKELETON_TODAY = "2026-01-06";
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
    date: "2026-01-08",
    shift_name: "Ca s\u00e1ng",
    start_time: "07:00",
    end_time: "14:00",
  },
  {
    date: "2026-01-10",
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

interface ScheduleClientProps {
  initialData: ScheduleWeekData;
  initialWeekStart: string;
}

function ScheduleSkeletonFallback() {
  return (
    <div className="rounded-md border bg-card">
      <Table className="min-w-max table-fixed border-collapse">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="sticky left-0 z-20 w-24 border-r bg-muted/40">
              <Skeleton className="h-4 w-12" />
            </TableHead>
            {Array.from({ length: 7 }).map((_, index) => (
              <TableHead
                key={index}
                className="min-w-28 border-l p-2 align-top whitespace-normal"
              >
                <Skeleton className="mx-auto h-4 w-16" />
                <Skeleton className="mx-auto mt-2 h-3 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, rowIndex) => (
            <TableRow key={rowIndex} className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 w-24 border-r bg-card">
                <Skeleton className="h-4 w-14" />
              </TableHead>
              {Array.from({ length: 7 }).map((_, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className="min-w-28 border-l p-2 whitespace-normal"
                >
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatShiftTime(shift: ScheduleShift): string {
  return `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}`;
}

function getCalendarCellClass(isToday: boolean): string {
  return cn(
    "min-w-28 border-l p-2 align-top whitespace-normal",
    isToday && "bg-primary/5",
  );
}

function ScheduleWeekCalendarTable({
  data,
  todayStr,
  weekDates,
}: {
  data: ScheduleWeekData;
  todayStr: string;
  weekDates: string[];
}) {
  const shiftsByDate = new Map<string, ScheduleShift>();
  for (const shift of data.shifts) {
    shiftsByDate.set(shift.date, shift);
  }

  const attendanceByDate = new Map<string, ScheduleAttendance>();
  for (const attendance of data.attendance) {
    attendanceByDate.set(attendance.date, attendance);
  }

  const calendarDays = weekDates.map((dateStr) => ({
    attendance: attendanceByDate.get(dateStr),
    dateStr,
    dayName: getDayName(dateStr),
    isToday: dateStr === todayStr,
    shift: shiftsByDate.get(dateStr),
  }));

  return (
    <div className="rounded-md border bg-card">
      <Table className="min-w-max table-fixed border-collapse">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="sticky left-0 z-20 w-24 border-r bg-muted/40 align-bottom whitespace-normal">
              <span className="font-heading text-sm font-semibold">
                {copy.calendarAxisLabel}
              </span>
            </TableHead>
            {calendarDays.map((day) => (
              <TableHead
                key={day.dateStr}
                className={cn(
                  "min-w-28 border-l p-2 text-center align-top whitespace-normal",
                  day.isToday && "bg-primary/10 text-primary",
                )}
                scope="col"
              >
                <span className="block text-xs font-medium">
                  {day.dayName}
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold tabular-nums">
                  {formatDate(day.dateStr)}
                </span>
                {day.isToday ? (
                  <span className="mt-1 block text-xs font-medium">
                    {copy.today}
                  </span>
                ) : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="row"
              className="sticky left-0 z-10 w-24 border-r bg-card text-xs text-muted-foreground whitespace-normal"
            >
              {copy.rowShift}
            </TableHead>
            {calendarDays.map((day) => (
              <TableCell
                key={day.dateStr}
                className={getCalendarCellClass(day.isToday)}
              >
                <div className="flex min-h-20 flex-col gap-1">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      !day.shift && "text-muted-foreground",
                    )}
                  >
                    {day.shift?.shift_name ?? copy.rest}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {day.shift ? formatShiftTime(day.shift) : "\u2014"}
                  </span>
                </div>
              </TableCell>
            ))}
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="row"
              className="sticky left-0 z-10 w-24 border-r bg-card text-xs text-muted-foreground whitespace-normal"
            >
              {copy.rowAttendance}
            </TableHead>
            {calendarDays.map((day) => {
              const hasClock = Boolean(
                day.attendance?.check_in || day.attendance?.check_out,
              );

              return (
                <TableCell
                  key={day.dateStr}
                  className={getCalendarCellClass(day.isToday)}
                >
                  <div className="flex min-h-20 flex-col gap-1">
                    {hasClock ? (
                      <>
                        <span className="font-mono text-xs tabular-nums">
                          {copy.checkInShort}{" "}
                          {formatTime(day.attendance?.check_in)}
                        </span>
                        <span className="font-mono text-xs tabular-nums">
                          {copy.checkOutShort}{" "}
                          {formatTime(day.attendance?.check_out)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {copy.noAttendance}
                      </span>
                    )}
                  </div>
                </TableCell>
              );
            })}
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="row"
              className="sticky left-0 z-10 w-24 border-r bg-card text-xs text-muted-foreground whitespace-normal"
            >
              {copy.rowStatus}
            </TableHead>
            {calendarDays.map((day) => {
              const attendanceLabel = day.attendance
                ? (ATTENDANCE_STATUS_LABELS[day.attendance.status] ??
                  day.attendance.status)
                : copy.noAttendance;

              return (
                <TableCell
                  key={day.dateStr}
                  className={getCalendarCellClass(day.isToday)}
                >
                  <div className="flex min-h-20 items-start">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        day.attendance
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {attendanceLabel}
                    </span>
                  </div>
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export function ScheduleClient({
  initialData,
  initialWeekStart,
}: ScheduleClientProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weekData, setWeekData] = useState<ScheduleWeekData>(initialData);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const todayStr = getVNDateString();
  const currentMonday = getVNWeekStartDateString();
  const isCurrentWeek = weekStart === currentMonday;
  const weekDates = generateWeekDates(weekStart);

  function loadWeek(newWeekStart: string) {
    setWeekStart(newWeekStart);
    setError(null);
    startTransition(async () => {
      const result = await fetchMySchedule(newWeekStart);
      if (result.success) {
        setWeekData(result.data ?? EMPTY_WEEK);
      } else {
        setError(result.error ?? copy.loadError);
        setWeekData(EMPTY_WEEK);
      }
    });
  }

  function goToPrevWeek() {
    loadWeek(addVNDateDays(weekStart, -7));
  }

  function goToNextWeek() {
    loadWeek(addVNDateDays(weekStart, 7));
  }

  function goToCurrentWeek() {
    loadWeek(currentMonday);
  }

  const weekEndStr = weekDates[6];
  const weekLabel = weekEndStr
    ? `${formatDate(weekStart)} - ${formatDate(weekEndStr)}`
    : formatDate(weekStart);

  return (
    <>
      <EmployeePanel title={copy.weekPanelTitle}>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="touch"
            className="w-12 px-0"
            onClick={goToPrevWeek}
            disabled={isPending}
            aria-label={copy.prevWeek}
          >
            <IconChevronLeft />
          </Button>

          <div className="flex flex-1 flex-col items-center gap-1 text-center">
            <p className="font-mono text-sm font-medium tabular-nums">
              {weekLabel}
            </p>
            {!isCurrentWeek ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={goToCurrentWeek}
                disabled={isPending}
              >
                {copy.currentWeek}
              </Button>
            ) : (
              <span className="text-xs font-medium text-primary">
                {copy.currentWeek}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="touch"
            className="w-12 px-0"
            onClick={goToNextWeek}
            disabled={isPending}
            aria-label={copy.nextWeek}
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
              onClick={() => loadWeek(weekStart)}
              disabled={isPending}
            >
              <IconRefresh data-icon="inline-start" />
              {copy.retry}
            </Button>
          </div>
        </EmployeePanel>
      ) : (
        <EmployeePanel title={copy.weekListTitle}>
          <AppBoneyardSkeleton
            name="employee-schedule-week"
            loading={isPending}
            fixture={
              <ScheduleWeekCalendarTable
                data={{
                  shifts: SCHEDULE_SKELETON_FIXTURE_SHIFTS,
                  attendance: SCHEDULE_SKELETON_FIXTURE_ATTENDANCE,
                }}
                todayStr={SCHEDULE_SKELETON_TODAY}
                weekDates={SCHEDULE_SKELETON_FIXTURE_DATES}
              />
            }
            fallback={<ScheduleSkeletonFallback />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <ScheduleWeekCalendarTable
              data={weekData}
              todayStr={todayStr}
              weekDates={weekDates}
            />
          </AppBoneyardSkeleton>
        </EmployeePanel>
      )}
    </>
  );
}
