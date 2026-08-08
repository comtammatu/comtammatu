"use client";

import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Repeat2 as IconRepeat,
  Star as IconStar,
} from "lucide-react";
import { STATES_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import {
  rosterAssignmentKey,
  type RosterEmployee,
  type RosterWeekData,
} from "@lib/hr/roster/roster-model";
import {
  EMPTY_SHIFT_VALUE,
  formatShiftLabel,
} from "@lib/hr/roster/roster-week-helpers";
import { useRosterWeekEditor } from "@lib/hr/roster/use-roster-week-editor";
import {
  formatRosterDayHeader,
  formatRosterWeekRange,
} from "@lib/hr/roster/week";
import { WeeklyScheduleDialog } from "@lib/hr/roster/weekly-schedule-dialog";

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
    handleCellChange,
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

  function renderShiftSelect(employee: RosterEmployee, workDate: string) {
    const key = rosterAssignmentKey(employee.employeeId, workDate);
    const selected = assignmentMap.get(key)?.toString() ?? EMPTY_SHIFT_VALUE;
    const leader = leaderMap.get(key);
    const canToggleLeader =
      !dirty &&
      selected !== EMPTY_SHIFT_VALUE &&
      leader != null &&
      leader.assignmentId > 0;
    return (
      <div className="flex min-w-0 items-center gap-1">
        <Select
          value={selected}
          onValueChange={(value) =>
            handleCellChange(employee.employeeId, workDate, value)
          }
          disabled={isPending}
        >
          <SelectTrigger size="touch" className="w-full min-w-0 flex-1">
            <SelectValue placeholder={copy.emptyShift} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SHIFT_VALUE} size="touch">
              {copy.emptyShift}
            </SelectItem>
            {data.shifts.map((shift) => (
              <SelectItem key={shift.id} value={String(shift.id)} size="touch">
                {formatShiftLabel(shift.name, shift.startTime, shift.endTime)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          className="shrink-0"
          disabled={isPending || !canToggleLeader}
          aria-label={
            leader?.isLeader ? copy.unmarkShiftLeader : copy.markShiftLeader
          }
          title={
            leader?.isLeader ? copy.unmarkShiftLeader : copy.markShiftLeader
          }
          onClick={() =>
            handleLeaderToggle(employee.employeeId, workDate, !leader?.isLeader)
          }
        >
          <IconStar
            className={cn(
              "size-4",
              leader?.isLeader
                ? "fill-current text-warning"
                : "text-muted-foreground",
            )}
          />
        </Button>
      </div>
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

  return (
    <div className="flex min-w-0 flex-col gap-3">
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

      <BranchOperatorPanel
        title={copy.title}
        description={formatRosterWeekRange(weekStart)}
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
          <ItemGroup className="grid gap-2">
            {data.employees.map((employee) => (
              <Item
                key={employee.employeeId}
                variant="outline"
                className="items-start"
              >
                <ItemContent className="min-w-0 gap-3">
                  <div className="flex w-full items-start justify-between gap-2">
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
                  <div className="flex w-full flex-col gap-2">
                    {weekDates.map((date) => (
                      <div key={date} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-24 shrink-0 text-xs">
                          {formatRosterDayHeader(date)}
                        </span>
                        <div className="min-w-0 flex-1">
                          {renderShiftSelect(employee, date)}
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

      <WeeklyScheduleDialog
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
