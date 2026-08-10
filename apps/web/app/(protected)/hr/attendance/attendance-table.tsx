"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import {
  getVNDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
} from "@comtammatu/shared/time";
import { isStaleOpenAttendanceRecord } from "@lib/hr/branch-attendance-model";
import { messages } from "@lib/messages";
import {
  fetchAttendance,
  fetchAttendanceCalendar,
  fetchAttendanceSummary,
  type AttendanceCalendarEmployee,
  type AttendanceCalendarLeave,
} from "../actions";
import { calculateAttendanceWorkHours } from "../attendance-summary";
import { resolveHrBranchScope } from "@/lib/hr-scope";
import { AttendanceCalendarHost } from "./attendance-calendar-host";
import {
  AttendanceListFrame,
  AttendanceToolbarActions,
  AttendanceToolbarFilters,
} from "./attendance-list-chrome";
import type {
  AttendanceRecord,
  AttendanceSummaryRow,
  AttendanceTableProps,
  AttendanceView,
  CalendarScope,
} from "./attendance-types";

export type { AttendanceTableProps } from "./attendance-types";

export function AttendanceTable({
  branches,
  initialBranchId,
  initialBranchScope,
  initialMonth = getVNMonthString(),
  initialView = "summary",
  initialDay = null,
  initialEmployeeId = null,
  initialCalendarScope = "all",
  urlTab,
  todayMode = false,
  routePath = "/hr/attendance",
  canForceClose = false,
  canCorrect = false,
}: AttendanceTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
  const [calendarEmployees, setCalendarEmployees] = useState<
    AttendanceCalendarEmployee[]
  >([]);
  const [calendarLeaves, setCalendarLeaves] = useState<
    AttendanceCalendarLeave[]
  >([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const selectedBranch = resolveHrBranchScope(
    initialBranchScope ?? String(initialBranchId ?? "all"),
    branches,
  );
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [view, setView] = useState<AttendanceView>(initialView);
  const [selectedDay, setSelectedDay] = useState<string | null>(
    initialView === "calendar" ? initialDay : null,
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    initialView === "calendar" ? initialEmployeeId : null,
  );
  const [calendarScope, setCalendarScope] = useState<CalendarScope>(
    initialView === "calendar" ? initialCalendarScope : "all",
  );
  const [isPending, startTransition] = useTransition();
  const todayDate = getVNDateString();

  function ownsLiveTab(): boolean {
    const liveTab = searchParams.get("tab");
    if (todayMode) {
      return liveTab == null || liveTab === "today";
    }
    if (!urlTab) return true;
    return liveTab === urlTab;
  }

  function syncAttendanceUrl(
    branchId: string,
    month: string,
    nextView: AttendanceView,
    nextDay: string | null,
    nextEmployeeId: number | null,
    nextCalendarScope: CalendarScope,
  ) {
    if (!ownsLiveTab()) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("branch", String(branchId));

    if (todayMode) {
      params.delete("tab");
      params.delete("month");
      params.delete("view");
      params.delete("day");
      params.delete("employee");
      params.delete("filter");
      params.delete("week");
      params.delete("panel");
      params.delete("leave-view");
    } else {
      if (urlTab) params.set("tab", urlTab);
      params.set("month", month);
      params.set("view", nextView);
      params.delete("week");
      params.delete("panel");
      params.delete("leave-view");
      if (nextView === "calendar" && nextDay) params.set("day", nextDay);
      else params.delete("day");
      if (nextView === "calendar" && nextEmployeeId != null) {
        params.set("employee", String(nextEmployeeId));
      } else {
        params.delete("employee");
      }
      if (nextView === "calendar" && nextCalendarScope === "attention") {
        params.set("filter", "attention");
      } else {
        params.delete("filter");
      }
    }

    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${routePath}?${next}` : routePath, {
      scroll: false,
    });
  }

  // `nextView` rides as a parameter: the view-toggle handlers call
  // setView + loadData in the same tick, so reading `view` from the
  // closure would fetch the PREVIOUS mode and render an empty table.
  function loadData(
    branchId: string,
    month: string,
    nextView: AttendanceView = view,
    nextDay: string | null = null,
    nextEmployeeId: number | null = null,
    nextCalendarScope: CalendarScope = calendarScope,
  ) {
    setSelectedMonth(month);
    setSelectedDay(nextDay);
    setSelectedEmployeeId(nextEmployeeId);
    setCalendarScope(nextView === "calendar" ? nextCalendarScope : "all");
    syncAttendanceUrl(
      branchId,
      month,
      nextView,
      nextDay,
      nextEmployeeId,
      nextCalendarScope,
    );
    startTransition(async () => {
      const numericBranchId = Number(branchId);
      const scopeInput = {
        branchId:
          Number.isSafeInteger(numericBranchId) && numericBranchId > 0
            ? numericBranchId
            : null,
        officeOnly: branchId === "office",
        month,
        day: todayMode ? todayDate : undefined,
      };
      const viewResult =
        nextView === "summary"
          ? await fetchAttendanceSummary(scopeInput)
          : nextView === "calendar"
            ? await fetchAttendanceCalendar(scopeInput)
            : await fetchAttendance(scopeInput);

      if (viewResult.success) {
        if (nextView === "summary") {
          setSummary((viewResult.data ?? []) as AttendanceSummaryRow[]);
        } else if (nextView === "calendar") {
          const calendarData = viewResult.data as
            | {
                attendance: AttendanceRecord[];
                employees: AttendanceCalendarEmployee[];
                leaves: AttendanceCalendarLeave[];
              }
            | undefined;
          setRecords(calendarData?.attendance ?? []);
          setCalendarEmployees(calendarData?.employees ?? []);
          setCalendarLeaves(calendarData?.leaves ?? []);
        } else {
          setRecords((viewResult.data ?? []) as AttendanceRecord[]);
        }
      } else {
        toast.error(viewResult.error ?? ERRORS_VI.fallback);
      }
      setHasLoaded(true);
    });
  }

  function selectView(nextView: AttendanceView) {
    setView(nextView);
    loadData(
      selectedBranch,
      selectedMonth,
      nextView,
      null,
      nextView === "calendar" ? selectedEmployeeId : null,
      nextView === "calendar" ? calendarScope : "all",
    );
  }

  function selectCalendarDay(date: string | null) {
    setSelectedDay(date);
    syncAttendanceUrl(
      selectedBranch,
      selectedMonth,
      "calendar",
      date,
      selectedEmployeeId,
      calendarScope,
    );
  }

  function selectCalendarEmployee(employeeId: number | null) {
    setSelectedEmployeeId(employeeId);
    setSelectedDay(null);
    syncAttendanceUrl(
      selectedBranch,
      selectedMonth,
      "calendar",
      null,
      employeeId,
      calendarScope,
    );
  }

  function selectCalendarScope(scope: CalendarScope) {
    setCalendarScope(scope);
    setSelectedDay(null);
    syncAttendanceUrl(
      selectedBranch,
      selectedMonth,
      "calendar",
      null,
      selectedEmployeeId,
      scope,
    );
  }

  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    loadData(
      selectedBranch,
      selectedMonth,
      view,
      selectedDay,
      selectedEmployeeId,
      calendarScope,
    );
  }, []);

  const monthOptions = getVNMonthSequenceBack(6).map(({ date }) =>
    date.slice(0, 7),
  );
  const calendarRecords = selectedEmployeeId
    ? records.filter((record) => record.employee_id === selectedEmployeeId)
    : records;
  const employeeLeaves = selectedEmployeeId
    ? calendarLeaves.filter((leave) => leave.employee_id === selectedEmployeeId)
    : calendarLeaves;
  const staleOpenDates = calendarRecords
    .filter((record) => isStaleOpenAttendanceRecord(record, getVNDateString()))
    .map((record) => record.date);
  const selectedDayRecords = selectedDay
    ? calendarRecords.filter((record) => record.date === selectedDay)
    : [];
  const selectedDayLeave = selectedDay
    ? employeeLeaves.find(
        (leave) =>
          leave.start_date <= selectedDay && leave.end_date >= selectedDay,
      )
    : undefined;
  const selectedDayClosedShifts = selectedDayRecords.filter(
    (record) => record.check_out,
  ).length;
  const selectedDayOpenShifts = selectedDayRecords.filter(
    (record) => record.check_in && !record.check_out,
  ).length;
  const selectedDayWorkHours = selectedDayRecords.reduce(
    (total, record) =>
      total + calculateAttendanceWorkHours(record.check_in, record.check_out),
    0,
  );
  const selectedCalendarEmployee = calendarEmployees.find(
    (employee) => employee.id === selectedEmployeeId,
  );

  const listTitle = routePath.startsWith("/br/")
    ? undefined
    : messages.hr.client.attendanceTitle;

  const branchId =
    Number(selectedBranch) > 0 ? Number(selectedBranch) : null;

  const handleMonthChange = (value: string) => {
    loadData(
      selectedBranch,
      value,
      view,
      null,
      view === "calendar" ? selectedEmployeeId : null,
    );
  };

  const toolbarFilters = (
    <AttendanceToolbarFilters
      todayMode={todayMode}
      view={view}
      selectedMonth={selectedMonth}
      monthOptions={monthOptions}
      selectedEmployeeId={selectedEmployeeId}
      calendarEmployees={calendarEmployees}
      calendarScope={calendarScope}
      onMonthChange={handleMonthChange}
      onSelectCalendarEmployee={selectCalendarEmployee}
      onSelectCalendarScope={selectCalendarScope}
    />
  );

  const toolbarActions = (
    <AttendanceToolbarActions
      todayMode={todayMode}
      view={view}
      isPending={isPending}
      onSelectView={selectView}
    />
  );

  if (view === "calendar") {
    return (
      <AttendanceCalendarHost
        todayMode={todayMode}
        view={view}
        selectedMonth={selectedMonth}
        monthOptions={monthOptions}
        selectedBranch={selectedBranch}
        selectedEmployeeId={selectedEmployeeId}
        calendarScope={calendarScope}
        calendarEmployees={calendarEmployees}
        calendarRecords={calendarRecords}
        employeeLeaves={employeeLeaves}
        staleOpenDates={staleOpenDates}
        selectedDay={selectedDay}
        selectedDayRecords={selectedDayRecords}
        selectedDayLeave={selectedDayLeave}
        selectedDayClosedShifts={selectedDayClosedShifts}
        selectedDayOpenShifts={selectedDayOpenShifts}
        selectedDayWorkHours={selectedDayWorkHours}
        selectedCalendarEmployee={selectedCalendarEmployee}
        isPending={isPending}
        branchId={branchId}
        canForceClose={canForceClose}
        canCorrect={canCorrect}
        onMonthChange={handleMonthChange}
        onSelectView={selectView}
        onSelectCalendarDay={selectCalendarDay}
        onSelectCalendarEmployee={selectCalendarEmployee}
        onSelectCalendarScope={selectCalendarScope}
        onMutated={() =>
          loadData(
            selectedBranch,
            selectedMonth,
            "calendar",
            selectedDay,
            selectedEmployeeId,
          )
        }
      />
    );
  }

  return (
    <AttendanceListFrame
      listTitle={listTitle}
      todayMode={todayMode}
      toolbarFilters={toolbarFilters}
      toolbarActions={toolbarActions}
      view={view}
      summary={summary}
      records={records}
      hasLoaded={hasLoaded}
      isPending={isPending}
      selectedBranch={selectedBranch}
      canForceClose={canForceClose}
      canCorrect={canCorrect}
      onMutated={() => loadData(selectedBranch, selectedMonth, "clock")}
    />
  );
}
