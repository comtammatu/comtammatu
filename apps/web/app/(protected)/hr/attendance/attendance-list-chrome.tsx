"use client";

import type { ReactNode } from "react";
import { ListChecks as IconListChecks } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { formatQuantity } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import type {
  AttendanceCalendarEmployee,
} from "../actions";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { Combobox } from "@/components/form/combobox";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import type {
  AttendanceSummaryRow,
  AttendanceView,
  CalendarScope,
} from "./attendance-types";
import { DetailView } from "./attendance-detail-view";
import type { AttendanceRecord } from "./attendance-types";

const attendanceCopy = messages.employee.hrAttendance;

export const ATTENDANCE_TOOLBAR_CLASSNAME =
  "items-stretch [&>[data-slot=toolbar-group]]:w-full [&>[data-slot=separator]]:hidden sm:items-center sm:[&>[data-slot=toolbar-group]]:w-auto sm:[&>[data-slot=separator]]:block";

export function AttendanceToolbarFilters({
  todayMode,
  view,
  selectedMonth,
  monthOptions,
  selectedEmployeeId,
  calendarEmployees,
  calendarScope,
  onMonthChange,
  onSelectCalendarEmployee,
  onSelectCalendarScope,
}: {
  todayMode: boolean;
  view: AttendanceView;
  selectedMonth: string;
  monthOptions: string[];
  selectedEmployeeId: number | null;
  calendarEmployees: AttendanceCalendarEmployee[];
  calendarScope: CalendarScope;
  onMonthChange: (month: string) => void;
  onSelectCalendarEmployee: (employeeId: number | null) => void;
  onSelectCalendarScope: (scope: CalendarScope) => void;
}) {
  const controlSize = useFormControlSize();

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
      {todayMode ? null : (
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger
            size={controlSize}
            className="w-full sm:w-40"
            aria-label={attendanceCopy.attendanceMonthAria}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((month) => (
              <SelectItem key={month} value={month}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!todayMode && view === "calendar" ? (
        <>
          <Combobox
            value={selectedEmployeeId?.toString() ?? "all"}
            onValueChange={(value) =>
              onSelectCalendarEmployee(value === "all" ? null : Number(value))
            }
            options={[
              {
                value: "all",
                label: attendanceCopy.calendarAllEmployees,
              },
              ...calendarEmployees.map((employee) => ({
                value: String(employee.id),
                label:
                  employee.full_name ||
                  employee.employee_code ||
                  attendanceCopy.employeeCode,
                hint: employee.employee_code || undefined,
              })),
            ]}
            placeholder={attendanceCopy.calendarEmployeeLabel}
            searchPlaceholder={attendanceCopy.calendarEmployeeSearch}
            emptyMessage={attendanceCopy.calendarEmployeeEmpty}
            aria-label={attendanceCopy.calendarEmployeeLabel}
            triggerClassName="col-span-2 w-full sm:w-64"
          />
          <Select
            value={calendarScope}
            onValueChange={(value) => {
              if (value === "all" || value === "attention") {
                onSelectCalendarScope(value);
              }
            }}
          >
            <SelectTrigger
              size={controlSize}
              className="col-span-2 w-full sm:w-44"
              aria-label={attendanceCopy.calendarScopeLabel}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {attendanceCopy.calendarScopeAll}
              </SelectItem>
              <SelectItem value="attention">
                {attendanceCopy.calendarScopeAttention}
              </SelectItem>
            </SelectContent>
          </Select>
        </>
      ) : null}
    </div>
  );
}

export function AttendanceToolbarActions({
  todayMode,
  view,
  isPending,
  onSelectView,
}: {
  todayMode: boolean;
  view: AttendanceView;
  isPending: boolean;
  onSelectView: (view: AttendanceView) => void;
}) {
  const controlSize = useFormControlSize();

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {todayMode ? null : (
        <ToggleGroup
          type="single"
          size={controlSize === "touch" ? "touch" : "default"}
          value={view}
          onValueChange={(value) => {
            if (
              value === "clock" ||
              value === "summary" ||
              value === "calendar"
            ) {
              onSelectView(value);
            }
          }}
          aria-label={attendanceCopy.viewSwitcher}
        >
          <ToggleGroupItem value="summary">
            {attendanceCopy.summaryView}
          </ToggleGroupItem>
          <ToggleGroupItem value="calendar">
            {attendanceCopy.calendarView}
          </ToggleGroupItem>
          <ToggleGroupItem value="clock">
            {attendanceCopy.clockView}
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      {isPending ? <Spinner /> : null}
    </div>
  );
}

export function SummaryView({
  data,
  loading = false,
}: {
  data: AttendanceSummaryRow[];
  loading?: boolean;
}) {
  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <AppEmptyState
        title={attendanceCopy.summaryEmptyTitle}
        description={attendanceCopy.summaryEmptyDescription}
        icon={<IconListChecks />}
      />
    );
  }

  const columns: DataTableColumn<AttendanceSummaryRow>[] = [
    {
      key: "index",
      header: "#",
      className: "w-12 text-right font-mono tabular-nums",
      render: (_, index) => index + 1,
    },
    {
      key: "employee",
      header: attendanceCopy.fullName,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.full_name || "—"}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {row.employee_code || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "workdays",
      header: attendanceCopy.summaryWorkdaysCountHeader,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatQuantity(row.workdays),
    },
    {
      key: "work_hours",
      header: attendanceCopy.summaryWorkHoursCountHeader,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatQuantity(row.work_hours),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.employee_id}
      mobileCardRender={(row, index) => (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle size="heading" className="line-clamp-none">
              {row.full_name || "—"}
            </ItemTitle>
            <ItemDescription className="line-clamp-none text-sm leading-6">
              {row.employee_code || "—"}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="grid grid-cols-3 gap-3 text-right font-mono text-sm tabular-nums">
              <div>
                <div className="text-xs text-muted-foreground">#</div>
                <div>{index + 1}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {attendanceCopy.summaryWorkdays}
                </div>
                <div>{formatQuantity(row.workdays)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {attendanceCopy.summaryWorkHours}
                </div>
                <div>{formatQuantity(row.work_hours)}</div>
              </div>
            </div>
          </ItemActions>
        </Item>
      )}
    />
  );
}

export function AttendanceListFrame({
  listTitle,
  todayMode,
  toolbarFilters,
  toolbarActions,
  view,
  summary,
  records,
  hasLoaded,
  isPending,
  selectedBranch,
  canForceClose,
  canCorrect,
  onMutated,
}: {
  listTitle: string | undefined;
  todayMode: boolean;
  toolbarFilters: ReactNode;
  toolbarActions: ReactNode;
  view: AttendanceView;
  summary: AttendanceSummaryRow[];
  records: AttendanceRecord[];
  hasLoaded: boolean;
  isPending: boolean;
  selectedBranch: string;
  canForceClose: boolean;
  canCorrect: boolean;
  onMutated: () => void;
}) {
  return (
    <AppListFrame
      title={listTitle}
      description={todayMode ? undefined : attendanceCopy.workdayRule}
      contentScroll
      toolbar={
        <AppToolbar
          variant="inline"
          className={ATTENDANCE_TOOLBAR_CLASSNAME}
          filters={toolbarFilters}
          actions={toolbarActions}
        />
      }
    >
      {view === "summary" ? (
        <SummaryView data={summary} loading={!hasLoaded || isPending} />
      ) : (
        <DetailView
          branchId={
            Number(selectedBranch) > 0 ? Number(selectedBranch) : null
          }
          data={records}
          compact={todayMode}
          todayColumns={todayMode}
          loading={!hasLoaded || isPending}
          canForceClose={canForceClose}
          canCorrect={canCorrect}
          onMutated={onMutated}
        />
      )}
    </AppListFrame>
  );
}
