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
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  rosterAssignmentKey,
  type RosterEmployee,
  type RosterWeekData,
} from "./roster-model";
import {
  EMPTY_SHIFT_VALUE,
  formatShiftLabel,
} from "./roster-week-helpers";
import { useRosterWeekEditor } from "./use-roster-week-editor";
import {
  formatRosterDayHeader,
  formatRosterWeekRange,
} from "./week";
import { WeeklyScheduleDialog } from "./weekly-schedule-dialog";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const copy = messages.hr.roster;

export type RosterSiteOption = {
  branchId: number | null;
  label: string;
};

export function RosterWeekClient({
  branchId,
  siteOptions,
  weekStart,
  data,
  canAssign,
  loadFailed,
  urlTab,
}: {
  branchId: number | null;
  siteOptions?: RosterSiteOption[];
  weekStart: string;
  data: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
  urlTab?: string;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

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
    handleSiteChange,
    handleWeekShift,
    handleCellChange,
    handleSave,
    handleCopyPreviousWeek,
    handleLeaderToggle,
    refreshRoster,
  } = useRosterWeekEditor({ branchId, weekStart, data, urlTab });

  function renderScheduleButton(employee: RosterEmployee, className?: string) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={isTouchLayout ? "touch" : "default"}
        className={cn("px-3 text-sm", className)}
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
      branchId != null &&
      !dirty &&
      selected !== EMPTY_SHIFT_VALUE &&
      leader != null &&
      leader.assignmentId > 0;
    return (
      <div className="flex min-w-32 items-center gap-1">
        <Select
          value={selected}
          onValueChange={(value) =>
            handleCellChange(employee.employeeId, workDate, value)
          }
          disabled={isPending}
        >
          <SelectTrigger size={isTouchLayout ? "touch" : "default"} className="w-full min-w-0 flex-1">
            <SelectValue placeholder={copy.emptyShift} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SHIFT_VALUE} size={isTouchLayout ? "touch" : "default"}>
              {copy.emptyShift}
            </SelectItem>
            {data.shifts.map((shift) => (
              <SelectItem key={shift.id} value={String(shift.id)} size={isTouchLayout ? "touch" : "default"}>
                {formatShiftLabel(shift.name, shift.startTime, shift.endTime)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size={isTouchLayout ? "icon-touch" : "icon-sm"}
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

  const rosterColumns: DataTableColumn<RosterEmployee>[] = [
    {
      key: "employee",
      header: copy.columnEmployee,
      className: "sticky left-0 z-10 min-w-48 bg-card",
      render: (employee) => (
        <>
          <div className="font-medium">{employee.fullName}</div>
          <div className="text-muted-foreground text-xs">
            {[employee.employeeCode, employee.positionLabel]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {renderScheduleButton(employee, "mt-1 -ml-2")}
        </>
      ),
    },
    ...weekDates.map(
      (date): DataTableColumn<RosterEmployee> => ({
        key: date,
        header: formatRosterDayHeader(date),
        className: "min-w-32",
        render: (employee) => renderShiftSelect(employee, date),
      }),
    ),
  ];

  if (!canAssign) {
    return <AppEmptyState mode="no-access" />;
  }

  if (loadFailed) {
    return (
      <AppEmptyState mode="error" description={copy.loadAssignmentsFailed} />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <AppToolbar>
        {siteOptions?.length ? (
          <Select
            value={branchId == null ? "office" : String(branchId)}
            onValueChange={handleSiteChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-full min-w-48 sm:w-auto">
              <SelectValue placeholder={copy.siteFilterLabel} />
            </SelectTrigger>
            <SelectContent>
              {siteOptions.map((site) => (
                <SelectItem
                  key={site.branchId ?? "office"}
                  value={
                    site.branchId == null ? "office" : String(site.branchId)
                  }
                >
                  {site.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size={isTouchLayout ? "touch" : "default"}
            onClick={() => handleWeekShift(-7)}
            disabled={isPending}
            aria-label={copy.previousWeek}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 text-center text-sm font-medium">
            <div className="text-muted-foreground text-xs">
              {copy.weekLabel}
            </div>
            <div>{formatRosterWeekRange(weekStart)}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size={isTouchLayout ? "touch" : "default"}
            onClick={() => handleWeekShift(7)}
            disabled={isPending}
            aria-label={copy.nextWeek}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      </AppToolbar>

      <AppSection contentFlush>
        {data.employees.length === 0 ? (
          <AppEmptyState
            mode="no-data"
            title={copy.emptyEmployeesTitle}
            description={copy.emptyEmployeesDescription}
          />
        ) : (
          <DataTable
            columns={rosterColumns}
            data={data.employees}
            getRowKey={(employee) => employee.employeeId}
            mobileCardRender={(employee) => (
              <Item variant="outline" className="items-start">
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
                    {renderScheduleButton(employee, "shrink-0")}
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
            )}
          />
        )}
      </AppSection>

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
          size={isTouchLayout ? "touch" : "default"}
          className="min-w-0 flex-1"
          onClick={handleCopyPreviousWeek}
          disabled={isPending}
        >
          {copy.copyPreviousWeek}
        </Button>
        <Button
          type="button"
          size={isTouchLayout ? "touch" : "default"}
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
