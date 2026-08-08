"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Repeat2 as IconRepeat,
  Star as IconStar,
} from "lucide-react";
import { STATES_VI } from "@comtammatu/shared/messages";
import { addVNDateDays } from "@comtammatu/shared/time";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  copyRosterWeek,
  reconcileShiftAssignmentsWeek,
  setShiftAssignmentLeader,
} from "./actions";
import {
  rosterAssignmentKey,
  type RosterAssignment,
  type RosterEmployee,
  type RosterWeekData,
} from "./roster-model";
import {
  formatRosterDayHeader,
  formatRosterWeekRange,
  getVNWeekDates,
  getVNWeekStartMonday,
} from "./week";
import { WeeklyScheduleDialog } from "./weekly-schedule-dialog";

const copy = messages.hr.roster;
const EMPTY_SHIFT_VALUE = "__empty__";

export type RosterSiteOption = {
  branchId: number | null;
  label: string;
};

function buildAssignmentMap(
  assignments: RosterAssignment[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const assignment of assignments) {
    map.set(
      rosterAssignmentKey(assignment.employeeId, assignment.workDate),
      assignment.shiftId,
    );
  }
  return map;
}

function buildLeaderMap(
  assignments: RosterAssignment[],
): Map<string, { assignmentId: number; isLeader: boolean }> {
  const map = new Map<string, { assignmentId: number; isLeader: boolean }>();
  for (const assignment of assignments) {
    map.set(rosterAssignmentKey(assignment.employeeId, assignment.workDate), {
      assignmentId: assignment.id,
      isLeader: assignment.isShiftLeader,
    });
  }
  return map;
}

function formatShiftLabel(name: string, startTime: string, endTime: string) {
  return `${name} (${startTime.slice(0, 5)}–${endTime.slice(0, 5)})`;
}

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [assignmentMap, setAssignmentMap] = useState(() =>
    buildAssignmentMap(data.assignments),
  );
  const [leaderMap, setLeaderMap] = useState(() =>
    buildLeaderMap(data.assignments),
  );
  const [dirty, setDirty] = useState(false);
  const [scheduleEmployeeId, setScheduleEmployeeId] = useState<number | null>(
    null,
  );

  const weekDates = useMemo(() => getVNWeekDates(weekStart), [weekStart]);

  useEffect(() => {
    setAssignmentMap(buildAssignmentMap(data.assignments));
    setLeaderMap(buildLeaderMap(data.assignments));
    setDirty(false);
  }, [data.assignments, weekStart, branchId]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const liveTab = searchParams.get("tab");
      if (urlTab && liveTab && liveTab !== urlTab) return;

      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      if (urlTab) params.set("tab", urlTab);
      const next = params.toString();
      const current = searchParams.toString();
      if (next === current) return;
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname);
      });
    },
    [pathname, router, searchParams, startTransition, urlTab],
  );

  function handleSiteChange(value: string) {
    replaceParams((params) => {
      params.set("branch", value === "office" ? "office" : value);
    });
  }

  function handleWeekShift(deltaDays: number) {
    const nextWeekStart = getVNWeekStartMonday(
      addVNDateDays(weekStart, deltaDays),
    );
    replaceParams((params) => {
      params.set("week", nextWeekStart);
    });
  }

  function handleCellChange(
    employeeId: number,
    workDate: string,
    value: string,
  ) {
    const key = rosterAssignmentKey(employeeId, workDate);
    setAssignmentMap((current) => {
      const next = new Map(current);
      if (value === EMPTY_SHIFT_VALUE) {
        next.delete(key);
      } else {
        next.set(key, Number(value));
      }
      return next;
    });
    setDirty(true);
  }

  function refreshRoster() {
    startTransition(() => {
      router.refresh();
    });
  }

  function handleSave() {
    startTransition(async () => {
      const assignments = Array.from(assignmentMap.entries()).flatMap(
        ([key, shiftId]) => {
          const separator = key.indexOf(":");
          if (separator <= 0) return [];
          const employeeId = Number(key.slice(0, separator));
          const workDate = key.slice(separator + 1);
          if (!employeeId || !workDate) return [];
          return [{ employeeId, workDate, shiftId }];
        },
      );
      const result = await reconcileShiftAssignmentsWeek({
        branchId,
        weekStart,
        assignments,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.saveSuccess);
      setDirty(false);
      refreshRoster();
    });
  }

  function handleCopyPreviousWeek() {
    const sourceWeekStart = addVNDateDays(weekStart, -7);
    startTransition(async () => {
      const result = await copyRosterWeek({
        branchId,
        sourceWeekStart,
        targetWeekStart: weekStart,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.copySuccess);
      refreshRoster();
    });
  }

  const scheduleEmployee =
    data.employees.find(
      (employee) => employee.employeeId === scheduleEmployeeId,
    ) ?? null;
  const selectedSchedule =
    data.weeklySchedules.find(
      (schedule) => schedule.employeeId === scheduleEmployeeId,
    ) ?? null;

  function scheduleLabel(employeeId: number) {
    const schedule = data.weeklySchedules.find(
      (item) => item.employeeId === employeeId,
    );
    if (!schedule) return copy.schedule;
    return copy.scheduleDays(
      Object.values(schedule.shiftsByDay).filter((shiftId) => shiftId != null)
        .length,
    );
  }

  function renderScheduleButton(employee: RosterEmployee, className?: string) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-7 px-2 text-xs", className)}
        onClick={() => setScheduleEmployeeId(employee.employeeId)}
        disabled={isPending || data.shifts.length === 0}
      >
        <IconRepeat className="size-3.5" />
        {scheduleLabel(employee.employeeId)}
      </Button>
    );
  }

  function handleLeaderToggle(
    employeeId: number,
    workDate: string,
    nextLeader: boolean,
  ) {
    if (branchId == null || dirty) return;
    const key = rosterAssignmentKey(employeeId, workDate);
    const current = leaderMap.get(key);
    if (!current || current.assignmentId <= 0) return;

    startTransition(async () => {
      const result = await setShiftAssignmentLeader({
        branchId,
        assignmentId: current.assignmentId,
        isLeader: nextLeader,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.shiftLeaderFailed);
        return;
      }
      toast.success(
        nextLeader ? copy.shiftLeaderSetSuccess : copy.shiftLeaderClearedSuccess,
      );
      refreshRoster();
    });
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
          <SelectTrigger className="w-full min-w-0 flex-1">
            <SelectValue placeholder={copy.emptyShift} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SHIFT_VALUE}>{copy.emptyShift}</SelectItem>
            {data.shifts.map((shift) => (
              <SelectItem key={shift.id} value={String(shift.id)}>
                {formatShiftLabel(shift.name, shift.startTime, shift.endTime)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
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
            size="touch"
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
            size="touch"
            onClick={() => handleWeekShift(7)}
            disabled={isPending}
            aria-label={copy.nextWeek}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      </AppToolbar>

      <AppSection
        title={copy.title}
        description={copy.description}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={handleCopyPreviousWeek}
              disabled={isPending}
            >
              {copy.copyPreviousWeek}
            </Button>
            <Button
              type="button"
              size="touch"
              onClick={handleSave}
              disabled={isPending || !dirty}
            >
              {isPending ? <Spinner className="size-4" /> : null}
              {copy.save}
            </Button>
          </div>
        }
        contentFlush
      >
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
