"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { countCompletedShiftWorkdays } from "@lib/staff-runtime/_lib/workday-math";
import { messages } from "@lib/messages";
import type {
  AttendanceCalendarEmployee,
  AttendanceCalendarLeave,
} from "../actions";
import { AttendanceCalendar } from "../attendance-calendar";
import { AppSection, AppToolbar } from "@/components/surface";
import { DetailView } from "./attendance-detail-view";
import {
  ATTENDANCE_TOOLBAR_CLASSNAME,
  AttendanceToolbarActions,
  AttendanceToolbarFilters,
} from "./attendance-list-chrome";
import type {
  AttendanceRecord,
  AttendanceView,
  CalendarScope,
} from "./attendance-types";

const attendanceCopy = messages.employee.hrAttendance;
const scheduleCopy = messages.employee.schedule;

export function AttendanceCalendarHost({
  todayMode,
  view,
  selectedMonth,
  monthOptions,
  selectedBranch,
  selectedEmployeeId,
  calendarScope,
  calendarEmployees,
  calendarRecords,
  employeeLeaves,
  staleOpenDates,
  selectedDay,
  selectedDayRecords,
  selectedDayLeave,
  selectedDayClosedShifts,
  selectedDayOpenShifts,
  selectedDayWorkHours,
  selectedCalendarEmployee,
  isPending,
  branchId,
  canForceClose,
  canCorrect,
  onMonthChange,
  onSelectView,
  onSelectCalendarDay,
  onSelectCalendarEmployee,
  onSelectCalendarScope,
  onMutated,
}: {
  todayMode: boolean;
  view: AttendanceView;
  selectedMonth: string;
  monthOptions: string[];
  selectedBranch: string;
  selectedEmployeeId: number | null;
  calendarScope: CalendarScope;
  calendarEmployees: AttendanceCalendarEmployee[];
  calendarRecords: AttendanceRecord[];
  employeeLeaves: AttendanceCalendarLeave[];
  staleOpenDates: string[];
  selectedDay: string | null;
  selectedDayRecords: AttendanceRecord[];
  selectedDayLeave: AttendanceCalendarLeave | undefined;
  selectedDayClosedShifts: number;
  selectedDayOpenShifts: number;
  selectedDayWorkHours: number;
  selectedCalendarEmployee: AttendanceCalendarEmployee | undefined;
  isPending: boolean;
  branchId: number | null;
  canForceClose: boolean;
  canCorrect: boolean;
  onMonthChange: (month: string) => void;
  onSelectView: (view: AttendanceView) => void;
  onSelectCalendarDay: (date: string | null) => void;
  onSelectCalendarEmployee: (employeeId: number | null) => void;
  onSelectCalendarScope: (scope: CalendarScope) => void;
  onMutated: () => void;
}) {
  const isCalendarDetailTouch = useIsMobile();

  const toolbarFilters = (
    <AttendanceToolbarFilters
      todayMode={todayMode}
      view={view}
      selectedMonth={selectedMonth}
      monthOptions={monthOptions}
      selectedEmployeeId={selectedEmployeeId}
      calendarEmployees={calendarEmployees}
      calendarScope={calendarScope}
      onMonthChange={onMonthChange}
      onSelectCalendarEmployee={onSelectCalendarEmployee}
      onSelectCalendarScope={onSelectCalendarScope}
    />
  );

  const toolbarActions = (
    <AttendanceToolbarActions
      todayMode={todayMode}
      view={view}
      isPending={isPending}
      onSelectView={onSelectView}
    />
  );

  // Calendar mosaic is REPORT-like: non-sticky filters above AppSection.
  return (
    <div className="flex flex-col gap-4">
      <AppToolbar
        variant="card"
        className={ATTENDANCE_TOOLBAR_CLASSNAME}
        filters={toolbarFilters}
        actions={toolbarActions}
      />
      {todayMode ? null : (
        <p className="text-sm text-muted-foreground">
          {attendanceCopy.workdayRule}
        </p>
      )}
      <AppSection
        title={attendanceCopy.calendarTitle}
        description={
          calendarScope === "attention"
            ? attendanceCopy.calendarAttentionDescription
            : attendanceCopy.calendarDescription
        }
      >
        <AttendanceCalendar
          month={selectedMonth}
          records={calendarRecords}
          leaves={employeeLeaves}
          selectedDate={selectedDay}
          onSelectDate={onSelectCalendarDay}
          showShiftNames={selectedEmployeeId !== null}
          attentionOnly={calendarScope === "attention"}
          staleOpenDates={staleOpenDates}
        />
      </AppSection>
      <Sheet
        open={selectedDay !== null}
        onOpenChange={(open) => {
          if (!open) onSelectCalendarDay(null);
        }}
      >
        <SheetContent
          side={isCalendarDetailTouch ? "bottom" : "right"}
          className="max-h-dvh-95 overflow-hidden bg-background p-0 data-[side=right]:lg:w-1/2 data-[side=right]:lg:max-w-none"
        >
          {selectedDay ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {attendanceCopy.calendarDetailTitle(
                    formatVNBusinessDate(selectedDay),
                  )}
                </SheetTitle>
                <SheetDescription>
                  {selectedCalendarEmployee
                    ? `${selectedCalendarEmployee.full_name || selectedCalendarEmployee.employee_code} · ${attendanceCopy.calendarDetailDescription}`
                    : attendanceCopy.calendarDetailDescription}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                <div className="flex flex-col gap-3">
                  <Frame className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <Badge variant="outline">
                      {attendanceCopy.calendarActualSummary(
                        selectedDayClosedShifts,
                        countCompletedShiftWorkdays(selectedDayClosedShifts),
                        selectedDayWorkHours,
                      )}
                    </Badge>
                    {selectedDayOpenShifts > 0 ? (
                      <Badge variant="warning">
                        {attendanceCopy.openShiftCount(selectedDayOpenShifts)}
                      </Badge>
                    ) : null}
                    {selectedDayLeave ? (
                      <Badge
                        variant={
                          selectedDayLeave.status === "approved"
                            ? "info"
                            : "warning"
                        }
                      >
                        {selectedDayLeave.status === "approved"
                          ? scheduleCopy.leaveApproved
                          : scheduleCopy.leavePending}
                      </Badge>
                    ) : null}
                  </Frame>
                  <DetailView
                    branchId={branchId}
                    data={selectedDayRecords}
                    compact
                    canForceClose={canForceClose}
                    canCorrect={canCorrect}
                    onMutated={onMutated}
                  />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
