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
} from "lucide-react";
import { STATES_VI } from "@comtammatu/shared/messages";
import { addVNDateDays } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState, AppSection, AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import { copyRosterWeek, reconcileShiftAssignmentsWeek } from "./actions";
import {
  rosterAssignmentKey,
  type RosterAssignment,
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
  const [dirty, setDirty] = useState(false);
  const [scheduleEmployeeId, setScheduleEmployeeId] = useState<number | null>(
    null,
  );

  const weekDates = useMemo(() => getVNWeekDates(weekStart), [weekStart]);

  useEffect(() => {
    setAssignmentMap(buildAssignmentMap(data.assignments));
    setDirty(false);
  }, [data.assignments, weekStart, branchId]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      if (urlTab) params.set("tab", urlTab);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
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
            <SelectTrigger className="w-full min-w-[12rem] sm:w-auto">
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                    {copy.columnEmployee}
                  </th>
                  {weekDates.map((date) => (
                    <th
                      key={date}
                      className="min-w-[8.5rem] px-2 py-2 text-left font-medium"
                    >
                      {formatRosterDayHeader(date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.employees.map((employee) => (
                  <tr key={employee.employeeId} className="border-b align-top">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2">
                      <div className="font-medium">{employee.fullName}</div>
                      <div className="text-muted-foreground text-xs">
                        {[employee.employeeCode, employee.positionLabel]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 -ml-2 h-7 px-2 text-xs"
                        onClick={() =>
                          setScheduleEmployeeId(employee.employeeId)
                        }
                        disabled={isPending || data.shifts.length === 0}
                      >
                        <IconRepeat className="size-3.5" />
                        {scheduleLabel(employee.employeeId)}
                      </Button>
                    </td>
                    {weekDates.map((date) => {
                      const key = rosterAssignmentKey(
                        employee.employeeId,
                        date,
                      );
                      const selected =
                        assignmentMap.get(key)?.toString() ?? EMPTY_SHIFT_VALUE;
                      return (
                        <td key={key} className="px-2 py-2">
                          <Select
                            value={selected}
                            onValueChange={(value) =>
                              handleCellChange(employee.employeeId, date, value)
                            }
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-full min-w-[8rem]">
                              <SelectValue placeholder={copy.emptyShift} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_SHIFT_VALUE}>
                                {copy.emptyShift}
                              </SelectItem>
                              {data.shifts.map((shift) => (
                                <SelectItem
                                  key={shift.id}
                                  value={String(shift.id)}
                                >
                                  {formatShiftLabel(
                                    shift.name,
                                    shift.startTime,
                                    shift.endTime,
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
