"use client";

import { useState } from "react";
import {
  CalendarDays as IconCalendarDays,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Repeat2 as IconRepeat,
} from "lucide-react";
import { STATES_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { RosterDayCell } from "@lib/hr/roster/roster-day-cell";
import type { RosterEmployee, RosterWeekData } from "@lib/hr/roster/roster-model";
import { useRosterWeekEditor } from "@lib/hr/roster/use-roster-week-editor";
import {
  formatRosterDayHeader,
  formatRosterWeekRange,
} from "@lib/hr/roster/week";
import { WeeklyScheduleSheet } from "./weekly-schedule-sheet";

const copy = messages.hr.roster;

export function BranchRosterWeekClient({
  branchId,
  weekStart,
  data,
  canAssign,
  loadFailed,
}: {
  branchId: number;
  weekStart: string;
  data: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<string>("all");

  const {
    isPending,
    assignmentMap,
    leaderMap,
    dirty,
    weekDates,
    scheduleEmployeeId,
    setScheduleEmployeeId,
    scheduleEmployee,
    selectedSchedule,
    scheduleLabel,
    handleWeekShift,
    handleAddShift,
    handleRemoveShift,
    handleSave,
    handleCopyPreviousWeek,
    handleLeaderToggle,
    refreshRoster,
  } = useRosterWeekEditor({ branchId, weekStart, data });

  function renderScheduleButton(employee: RosterEmployee) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="touch"
        className="shrink-0 px-3 text-sm"
        onClick={() => setScheduleEmployeeId(employee.employeeId)}
        disabled={isPending || data.shifts.length === 0}
      >
        <IconRepeat className="size-4" />
        {scheduleLabel(employee.employeeId)}
      </Button>
    );
  }

  function renderDayCell(employee: RosterEmployee, workDate: string) {
    return (
      <RosterDayCell
        employeeId={employee.employeeId}
        workDate={workDate}
        shifts={data.shifts}
        assignedShiftIds={
          assignmentMap.get(`${employee.employeeId}:${workDate}`) ?? []
        }
        leaderMap={leaderMap}
        dirty={dirty}
        isPending={isPending}
        touch
        onAddShift={handleAddShift}
        onRemoveShift={handleRemoveShift}
        onLeaderToggle={handleLeaderToggle}
      />
    );
  }

  if (!canAssign) {
    return <AppEmptyState mode="no-access" />;
  }

  if (loadFailed) {
    return (
      <AppEmptyState mode="error" description={copy.loadAssignmentsFailed} />
    );
  }

  const visibleDates =
    selectedDay === "all"
      ? weekDates
      : weekDates.filter((date) => date === selectedDay);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Week Navigator */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => handleWeekShift(-7)}
          disabled={isPending}
          aria-label={copy.previousWeek}
        >
          <IconChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center text-sm font-medium">
          <div className="text-muted-foreground text-xs">{copy.weekLabel}</div>
          <div>{formatRosterWeekRange(weekStart)}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => handleWeekShift(7)}
          disabled={isPending}
          aria-label={copy.nextWeek}
        >
          <IconChevronRight className="size-4" />
        </Button>
      </div>

      {/* Day Filter Bar */}
      <div
        className="no-scrollbar flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
        role="group"
        aria-label={copy.selectDayAria}
      >
        <Button
          type="button"
          variant={selectedDay === "all" ? "secondary" : "outline"}
          size="touch"
          aria-pressed={selectedDay === "all"}
          className="shrink-0 gap-1.5 px-3"
          onClick={() => setSelectedDay("all")}
        >
          <IconCalendarDays className="size-4" />
          <span>{copy.allWeek}</span>
        </Button>
        {weekDates.map((date) => {
          const active = selectedDay === date;
          return (
            <Button
              key={date}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="touch"
              aria-pressed={active}
              className="shrink-0 px-3"
              onClick={() => setSelectedDay(date)}
            >
              <span>{formatRosterDayHeader(date)}</span>
            </Button>
          );
        })}
      </div>

      <BranchOperatorPanel
        title={copy.title}
        description={
          selectedDay === "all"
            ? formatRosterWeekRange(weekStart)
            : formatRosterDayHeader(selectedDay)
        }
        badge={{ children: data.employees.length }}
        size="sm"
      >
        {data.employees.length === 0 ? (
          <AppEmptyState
            compact
            mode="no-data"
            title={copy.emptyEmployeesTitle}
            description={copy.emptyEmployeesDescription}
          />
        ) : (
          <ItemGroup className="grid gap-3">
            {data.employees.map((employee) => (
              <Item
                key={employee.employeeId}
                variant="outline"
                className="items-start bg-card p-3"
              >
                <ItemContent className="min-w-0 gap-3">
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <div className="min-w-0">
                      <ItemTitle size="heading" className="line-clamp-none">
                        {employee.fullName}
                      </ItemTitle>
                      <ItemDescription>
                        {[employee.employeeCode, employee.positionLabel]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </ItemDescription>
                    </div>
                    {renderScheduleButton(employee)}
                  </div>

                  <div
                    className={cn(
                      "grid w-full gap-2",
                      selectedDay === "all"
                        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-7"
                        : "grid-cols-1",
                    )}
                  >
                    {visibleDates.map((date) => (
                      <div
                        key={date}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-md bg-muted/30 p-2.5",
                          selectedDay !== "all" && "p-3",
                        )}
                      >
                        <div className="flex items-center justify-between border-b pb-1">
                          <span className="text-xs font-semibold text-foreground">
                            {formatRosterDayHeader(date)}
                          </span>
                          {selectedDay === "all" ? null : (
                            <Badge variant="outline" className="text-2xs font-normal">
                              {date}
                            </Badge>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {renderDayCell(employee, date)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </BranchOperatorPanel>

      {isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-4" />
          {STATES_VI.loading}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t bg-background px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="min-w-0 flex-1"
          onClick={handleCopyPreviousWeek}
          disabled={isPending}
        >
          {copy.copyPreviousWeek}
        </Button>
        <Button
          type="button"
          size="touch"
          className="min-w-0 flex-1"
          onClick={handleSave}
          disabled={isPending || !dirty}
        >
          {isPending ? <Spinner className="size-4" /> : null}
          {copy.save}
        </Button>
      </div>

      <WeeklyScheduleSheet
        open={scheduleEmployeeId != null}
        onOpenChange={(open) => !open && setScheduleEmployeeId(null)}
        branchId={branchId}
        employee={scheduleEmployee}
        shifts={data.shifts}
        schedule={selectedSchedule}
        onSaved={refreshRoster}
      />
    </div>
  );
}
