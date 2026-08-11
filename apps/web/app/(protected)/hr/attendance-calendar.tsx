"use client";

import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { formatQuantity } from "@comtammatu/shared/format";
import {
  formatVNBusinessDate,
  getVNMonthEndDateString,
  getVNMonthCalendarCells,
} from "@comtammatu/shared/time";
import {
  expandLeaveRangesByDate,
  type CalendarLeaveStatus,
} from "@lib/hr/leave-calendar";
import { messages } from "@lib/messages";
import { calculateAttendanceWorkHours } from "./attendance-summary";
import { countCompletedShiftWorkdays } from "@lib/staff-runtime/_lib/workday-math";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
export interface AttendanceCalendarRecord {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  shifts?: { name: string; start_time: string; end_time: string } | null;
}

export interface AttendanceCalendarLeave {
  start_date: string;
  end_date: string;
  status: CalendarLeaveStatus;
}

interface AttendanceDaySummary {
  closedShifts: number;
  openShifts: number;
  workHours: number;
  shiftNames: string[];
}

const copy = messages.employee.hrAttendance;
const scheduleCopy = messages.employee.schedule;
const weekdayLabels = scheduleCopy.monthWeekdays;

function summarizeAttendanceByDate(records: AttendanceCalendarRecord[]) {
  const summaryByDate = new Map<string, AttendanceDaySummary>();

  for (const record of records) {
    const summary = summaryByDate.get(record.date) ?? {
      closedShifts: 0,
      openShifts: 0,
      workHours: 0,
      shiftNames: [],
    };

    if (
      record.shifts?.name &&
      !summary.shiftNames.includes(record.shifts.name)
    ) {
      summary.shiftNames.push(record.shifts.name);
    }

    if (record.check_out) {
      summary.closedShifts += 1;
      summary.workHours += calculateAttendanceWorkHours(
        record.check_in,
        record.check_out,
      );
    } else if (record.check_in) {
      summary.openShifts += 1;
    }

    summaryByDate.set(record.date, summary);
  }

  return summaryByDate;
}

function getCalendarDayAriaLabel(
  date: string,
  summary: AttendanceDaySummary | undefined,
  leave: CalendarLeaveStatus | undefined,
  needsAttention: boolean,
  isFilteredOut: boolean,
) {
  const attendanceLabel = summary
    ? copy.calendarDayAria(
        date,
        summary.closedShifts,
        summary.openShifts,
        countCompletedShiftWorkdays(summary.closedShifts),
        summary.workHours,
      )
    : copy.calendarDayAria(date, 0, 0, 0, 0);

  const leaveLabel = !leave
    ? attendanceLabel
    : `${attendanceLabel}. ${
        leave === "approved"
          ? scheduleCopy.leaveApproved
          : scheduleCopy.leavePending
      }`;

  if (needsAttention) {
    return `${leaveLabel}. ${copy.calendarAttention}`;
  }
  return isFilteredOut
    ? `${leaveLabel}. ${copy.calendarNoAttention}`
    : leaveLabel;
}

export function AttendanceCalendar({
  month,
  records,
  leaves,
  selectedDate,
  onSelectDate,
  showShiftNames = false,
  attentionOnly = false,
  staleOpenDates = [],
}: {
  month: string;
  records: AttendanceCalendarRecord[];
  leaves: AttendanceCalendarLeave[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  showShiftNames?: boolean;
  attentionOnly?: boolean;
  staleOpenDates?: string[];
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const summaryByDate = summarizeAttendanceByDate(records);
  const staleOpenDateSet = new Set(staleOpenDates);
  const cells = getVNMonthCalendarCells(`${month}-01`);
  const leaveByDate = expandLeaveRangesByDate(
    leaves.map((leave) => ({
      startDate: leave.start_date,
      endDate: leave.end_date,
      status: leave.status,
    })),
    `${month}-01`,
    getVNMonthEndDateString(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
    ),
  );
  const hasAttention =
    staleOpenDates.length > 0 ||
    Array.from(leaveByDate.values()).some((leave) => leave === "pending");

  return (
    <Frame className="overflow-hidden">
      {attentionOnly && !hasAttention ? (
        <p role="status" className="px-3 pt-3 text-sm text-muted-foreground">
          {copy.calendarAttentionEmpty}
        </p>
      ) : null}
      {attentionOnly && !hasAttention ? null : (
        <div className="min-w-0">
          <div
            role="grid"
            aria-label={copy.calendarGridAria}
            className="min-w-0 overflow-hidden"
          >
            <div role="row" className="grid grid-cols-7 bg-muted/30">
              {weekdayLabels.map((day) => (
                <div
                  key={day}
                  role="columnheader"
                  className="flex h-8 items-center justify-center border-l text-center text-xs font-medium first:border-l-0 sm:h-9"
                >
                  {day}
                </div>
              ))}
            </div>
            {Array.from(
              { length: Math.ceil(cells.length / 7) },
              (_, rowIndex) => (
                <div key={rowIndex} role="row" className="grid grid-cols-7">
                  {cells
                    .slice(rowIndex * 7, rowIndex * 7 + 7)
                    .map((cell, index) => {
                      const summary = cell.date
                        ? summaryByDate.get(cell.date)
                        : undefined;
                      const leave = cell.date
                        ? leaveByDate.get(cell.date)
                        : undefined;
                      const needsAttention = Boolean(
                        cell.date &&
                        (staleOpenDateSet.has(cell.date) ||
                          leave === "pending"),
                      );
                      const isFilteredOut = attentionOnly && !needsAttention;
                      const workdays = summary
                        ? countCompletedShiftWorkdays(summary.closedShifts)
                        : 0;
                      const calendarDetailLabel = isFilteredOut
                        ? null
                        : summary?.openShifts
                          ? copy.openShiftCount(summary.openShifts)
                          : leave
                            ? leave === "approved"
                              ? scheduleCopy.leaveApproved
                              : scheduleCopy.leavePending
                            : showShiftNames && summary?.shiftNames.length
                              ? summary.shiftNames.join(", ")
                              : null;
                      const calendarDetailTone = summary?.openShifts
                        ? "text-warning"
                        : leave === "approved"
                          ? "text-info"
                          : leave === "pending"
                            ? "text-warning"
                            : "text-muted-foreground";

                      return (
                        <div
                          key={cell.date ?? `${rowIndex}-${index}`}
                          role="gridcell"
                          className="flex min-h-24 min-w-0 border-l border-t p-0.5 align-top first:border-l-0 sm:min-h-28 sm:p-2"
                        >
                          {cell.date && cell.day != null ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size={isTouchLayout ? "touch" : "default"}
                              aria-label={getCalendarDayAriaLabel(
                                formatVNBusinessDate(cell.date),
                                summary,
                                leave,
                                needsAttention,
                                isFilteredOut,
                              )}
                              aria-pressed={cell.date === selectedDate}
                              disabled={isFilteredOut}
                              onClick={() => onSelectDate(cell.date!)}
                              className={cn(
                                "min-w-0 flex-1 flex-col items-stretch justify-start gap-1 overflow-hidden rounded-md bg-background p-1 text-left transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-move)] active:scale-[0.98] sm:p-2",
                                cell.isToday &&
                                  "bg-primary/10 ring-1 ring-primary/20",
                                cell.date === selectedDate &&
                                  "bg-info/10 ring-2 ring-info/20",
                                needsAttention &&
                                  "bg-warning/10 ring-1 ring-warning/20",
                                isFilteredOut &&
                                  "cursor-not-allowed opacity-40",
                              )}
                            >
                              <span
                                className={cn(
                                  "min-h-4 font-mono text-xs font-semibold tabular-nums sm:text-sm",
                                  cell.isToday && "text-primary",
                                )}
                              >
                                {cell.day}
                              </span>
                              <span className="min-h-8 line-clamp-2 text-xs leading-4 text-muted-foreground">
                                {summary?.closedShifts && !isFilteredOut ? (
                                  <>
                                    <span className="sm:hidden">
                                      {formatQuantity(workdays)}c
                                    </span>
                                    <span className="hidden sm:inline">
                                      {formatQuantity(workdays)}{"\u00a0"}
                                      {copy.workdayShort}
                                      {summary.workHours > 0
                                        ? ` · ${formatQuantity(summary.workHours)}\u00a0${copy.hourShort}`
                                        : ""}
                                    </span>
                                  </>
                                ) : (
                                  "—"
                                )}
                              </span>
                              <span
                                className={cn(
                                  "min-h-4 truncate text-xs leading-4",
                                  calendarDetailTone,
                                )}
                              >
                                {calendarDetailLabel ?? "\u00a0"}
                              </span>
                            </Button>
                          ) : (
                            <div
                              aria-hidden="true"
                              className="flex-1 rounded-md bg-muted/30"
                            />
                          )}
                        </div>
                      );
                    })}
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </Frame>
  );
}
