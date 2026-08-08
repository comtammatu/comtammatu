"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addVNDateDays } from "@comtammatu/shared/time";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import {
  copyRosterWeek,
  reconcileShiftAssignmentsWeek,
  setShiftAssignmentLeader,
} from "./actions";
import {
  rosterAssignmentKey,
  type RosterWeekData,
} from "./roster-model";
import {
  buildAssignmentMap,
  buildLeaderMap,
  EMPTY_SHIFT_VALUE,
} from "./roster-week-helpers";
import { getVNWeekDates, getVNWeekStartMonday } from "./week";

const copy = messages.hr.roster;

export function useRosterWeekEditor({
  branchId,
  weekStart,
  data,
  urlTab,
}: {
  branchId: number | null;
  weekStart: string;
  data: RosterWeekData;
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

  return {
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
  };
}
