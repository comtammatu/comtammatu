import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const hrPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/page.tsx"),
  "utf8",
);
const hrClientSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/hr-client.tsx"),
  "utf8",
);
const attendancePageSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/attendance/page.tsx"),
  "utf8",
);
const hrMessagesSource = readFileSync(
  join(process.cwd(), "lib/messages/hr.ts"),
  "utf8",
);
const attendanceTableSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/attendance/attendance-table.tsx"),
  "utf8",
);
const attendanceCalendarSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/attendance-calendar.tsx"),
  "utf8",
);
const hrActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/actions.ts"),
  "utf8",
);
const leaveCalendarSource = readFileSync(
  join(process.cwd(), "lib/hr/leave-calendar.ts"),
  "utf8",
);
const leaveRequestActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/leave-request-actions.ts"),
  "utf8",
);
const leaveRequestsTableSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/leave-requests-table.tsx"),
  "utf8",
);

test("Company HR attendance is a dedicated clock and approval surface", () => {
  assert.doesNotMatch(
    hrPageSource,
    /AttendanceTable|LeaveRequestsTable|AppPageTabs/,
    "the employee landing must not combine attendance, leave and payroll tabs",
  );
  assert.match(
    hrClientSource,
    /view === "accounts" \? staffCopy\.title : workspaceCopy\.ownerTitle/,
    "the employee landing should use the owner HR workspace title (accounts uses staff title)",
  );
  assert.match(
    attendancePageSource,
    /storeBranches[\s\S]*branch_kind[\s\S]*=== ["']branch["']/,
    "leave review must only offer store branches (RPC rejects central sites)",
  );
  assert.match(
    attendancePageSource,
    /<AttendanceTable[\s\S]*branches=\{branches\}[\s\S]*\/>[\s\S]*<LeaveRequestsTable[\s\S]*branches=\{storeBranches\}[\s\S]*branchScope=\{branchScope\}[\s\S]*historyPanelOpen/,
    "day-work and leave review should share their dedicated route",
  );
  assert.match(
    hrMessagesSource,
    /ownerTitle:\s*"Hồ sơ nhân viên"/,
    "Company HR landing should name the employee-record surface precisely",
  );
  assert.match(
    hrMessagesSource,
    /attendance:\s*"Chấm công"/,
    "HR attendance hub should name its job precisely",
  );
  assert.match(
    attendanceTableSource,
    /const toolbarActions =[\s\S]*<ToggleGroup[\s\S]*attendanceCopy\.summaryView[\s\S]*attendanceCopy\.clockView[\s\S]*<AppListFrame[\s\S]*variant="inline"[\s\S]*actions=\{toolbarActions\}/,
    "attendance filters and view selection must use AppListFrame + inline toolbar",
  );
  assert.match(
    attendanceTableSource,
    /record\.check_out[\s\S]*attendanceCopy\.checkedOut[\s\S]*record\.check_in[\s\S]*attendanceCopy\.inShift/,
    "Attendance rows should derive manager-facing state from check-in/out",
  );
  assert.match(
    hrActionsSource,
    /const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";/,
    "Attendance photo review should use the private attendance photo bucket",
  );
  assert.match(
    hrActionsSource,
    /claims\.user_role === "branch_manager"[\s\S]*claims\.branch_id == null[\s\S]*query = query\.eq\("branch_id", claims\.branch_id\)/,
    "Branch managers must only mint photo URLs for their assigned branch",
  );
  assert.match(
    hrActionsSource,
    /createSignedUrl\(\s*record\.check_in_photo_path,\s*ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS,\s*\)/,
    "Attendance photo review should mint short-lived signed URLs from stored paths",
  );
  assert.doesNotMatch(
    hrActionsSource,
    /getPublicUrl/,
    "Attendance photo review must not expose public Storage URLs",
  );
  assert.match(
    attendanceTableSource,
    /key: "photo",\s*header: attendanceCopy\.photo,/,
    "Attendance detail rows should expose a manager photo-review column",
  );
  assert.match(
    attendanceTableSource,
    /getAttendancePhotoUrl\(\{\s*attendanceId: record\.id,\s*branchId: recordBranchId,\s*\}\)/,
    "Attendance table should request a branch-scoped signed URL per attendance row",
  );
  assert.match(
    attendanceTableSource,
    /forceCloseStaleAttendance\(\{\s*attendanceId: closingRecord\.id,\s*branchId: recordBranchId,\s*note,\s*\}\)/,
    "Attendance stale-close mutation should stay scoped to the selected branch",
  );
  assert.match(
    attendanceTableSource,
    /<AppDialog[\s\S]*title=\{attendanceCopy\.photoDialogTitle\}/,
    "Attendance photo preview should render in an accessible dialog",
  );
  assert.match(
    attendanceTableSource,
    /function canForceCloseRecord[\s\S]*isStaleOpenAttendanceRecord\(record, todayStr\)/,
    "Force-close UI should mirror the scheduled shift-end predicate",
  );
  assert.match(
    hrActionsSource,
    /supabase\.rpc\(\s*"force_close_stale_attendance"/,
    "Force-close action should use the guarded stale attendance RPC",
  );
  assert.doesNotMatch(
    hrActionsSource,
    /\.from\("attendance_records"\)[\s\S]*\.update\(\{[\s\S]*check_out: checkOutTime/,
    "Force-close action must not bypass the stale attendance RPC with a direct update",
  );

  for (const forbidden of [
    "updateAttendanceStatus",
    "handleStatusChange",
    "onStatusChange",
    // Editable status dropdown is forbidden (read surface); the read-only
    // <StatusBadge value={record.status} /> fallback is allowed.
    "Select value={record.status}",
  ]) {
    assert.doesNotMatch(
      attendanceTableSource,
      new RegExp(forbidden.replace(/[{}]/g, "\\$&")),
      `attendance table must not contain ${forbidden}`,
    );
    assert.doesNotMatch(
      hrActionsSource,
      new RegExp(forbidden.replace(/[{}]/g, "\\$&")),
      `HR actions must not expose ${forbidden}`,
    );
  }
});

test("attendance and leave approval data stay in their respective tabs", () => {
  assert.doesNotMatch(
    attendancePageSource,
    /<AppSection title=\{copy\.attendanceTitle\}/,
  );
  assert.ok(
    attendanceTableSource.indexOf("<AppListFrame") <
      attendanceTableSource.indexOf("<SummaryView data={summary}"),
    "the LIST frame must precede the data table",
  );
  assert.match(
    attendanceTableSource,
    /const listTitle = routePath\.startsWith\("\/br\/"\)[\s\S]*messages\.hr\.client\.attendanceTitle[\s\S]*<AppListFrame[\s\S]*title=\{listTitle\}[\s\S]*<SummaryView data=\{summary\} loading=\{!hasLoaded \|\| isPending\} \/>/,
    "attendance data must render inside AppListFrame",
  );
  assert.doesNotMatch(
    attendanceTableSource,
    /fetchApprovedLeaveMonth|ApprovedLeavePanel/,
    "attendance must not render approved leave data",
  );
  assert.match(
    leaveRequestsTableSource,
    /const historyRows = useMemo\([\s\S]*request\.status === "pending"[\s\S]*request\.start_date <= endDate[\s\S]*request\.end_date >= startDate/,
    "leave history dialog must derive non-pending rows for the selected month",
  );
  assert.match(
    leaveRequestsTableSource,
    /panel", "leave-history"[\s\S]*<AppDialog[\s\S]*historyPanelOpen[\s\S]*data=\{historyRows\}/,
    "leave history opens as an addressable dialog with month/status filters",
  );
  assert.match(
    leaveRequestsTableSource,
    /<AppListFrame[\s\S]*variant="inline"[\s\S]*copy\.historyAction/,
    "leave pending queue keeps one Owner LIST frame without nested tabs",
  );
  assert.doesNotMatch(
    leaveRequestsTableSource,
    /paramKey="leave-view"|AppPageTabs/,
    "leave views must not overwrite the attendance tab URL state",
  );
  assert.doesNotMatch(
    attendancePageSource,
    /<TabsContent value="leave">[\s\S]*<AppSection/,
    "leave filters must not be enclosed by a page-level data section",
  );
  assert.doesNotMatch(
    leaveRequestActionsSource,
    /fetchApprovedLeaveMonth/,
    "leave approval tab should reuse its loaded history rather than fetch a duplicate dataset",
  );
  assert.match(
    attendanceTableSource,
    /key: "index",\s*header: "#"[\s\S]*key: "employee",\s*header: "Họ tên"[\s\S]*key: "workdays",\s*header: "Số ngày công"[\s\S]*key: "work_hours",\s*header: "Số giờ công"/,
  );
  assert.match(
    attendanceTableSource,
    /row\.full_name[\s\S]*row\.employee_code/,
    "employee name and code should remain a two-line identity cell",
  );
  assert.doesNotMatch(attendanceTableSource, /header: "Ca chưa kết"/);
  assert.match(
    hrActionsSource,
    /employee_id, date, check_in, check_out,[\s\S]*calculateAttendanceWorkHours\([\s\S]*record\.check_in,[\s\S]*record\.check_out/,
  );
});

test("individual calendar reads only branch-scoped attendance and leave state", () => {
  assert.match(
    attendanceTableSource,
    /fetchAttendanceCalendar\(scopeInput\)[\s\S]*<Combobox[\s\S]*attendanceCopy\.calendarEmployeeLabel/,
  );
  assert.match(
    hrActionsSource,
    /export const fetchAttendanceCalendar = withAction\([\s\S]*permission: PERMISSION_KEYS\.HR_VIEW_EMPLOYEE,[\s\S]*permissionBranchId: \(data\) => data\.branchId \?\? null/,
  );
  assert.match(
    hrActionsSource,
    /\.from\("leave_requests"\)[\s\S]*\.in\("status", \["pending", "approved"\]\)[\s\S]*leavesQuery = leavesQuery\.eq\("branch_id", data\.branchId\)/,
  );
  assert.match(
    attendanceCalendarSource,
    /leave === "approved"\s*\?\s*scheduleCopy\.leaveApproved\s*:\s*scheduleCopy\.leavePending/,
  );
  assert.match(
    leaveCalendarSource,
    /leave\.status === "approved" \|\| !leaveByDate\.has\(date\)/,
  );
});

test("calendar attention scope uses the stale-shift predicate and pending leave only", () => {
  assert.match(
    attendanceTableSource,
    /import \{ isStaleOpenAttendanceRecord \} from "@lib\/hr\/branch-attendance-model"/,
    "calendar attention must share the stale open-shift predicate used by force-close",
  );
  assert.match(
    readFileSync(
      join(process.cwd(), "lib/hr/branch-attendance-model.ts"),
      "utf8",
    ),
    /export function isStaleOpenAttendanceRecord[\s\S]*isShiftEndedForBusinessDate/,
    "shared stale-open predicate must use scheduled shift-end",
  );
  assert.match(
    attendanceTableSource,
    /type CalendarScope = "all" \| "attention"[\s\S]*function selectCalendarScope\(scope: CalendarScope\)[\s\S]*syncAttendanceUrl\([\s\S]*scope/,
    "attention scope should be recoverable through the calendar URL",
  );
  assert.match(
    attendanceTableSource,
    /nextCalendarScope === "attention"[\s\S]*params\.set\("filter", "attention"\)/,
    "attention filter must be written into owned timesheet URL keys",
  );
  assert.match(
    attendanceTableSource,
    /<Select[\s\S]*attendanceCopy\.calendarScopeLabel[\s\S]*calendarScopeAttention/,
    "calendar should expose an explicit attention scope control",
  );
  assert.match(
    attendanceCalendarSource,
    /staleOpenDateSet\.has\(cell\.date\)[\s\S]{0,80}leave === "pending"/,
    "only stale open shifts and pending leave should be marked as attention",
  );
  assert.match(
    attendanceCalendarSource,
    /disabled=\{isFilteredOut\}/,
    "non-attention days should not open a detail sheet while filtered",
  );
  assert.match(
    attendancePageSource,
    /resolveCalendarScope\(params\.filter\)/,
    "deep links should restore the requested calendar scope",
  );
});

test("calendar controls preserve a compact, non-scrolling mobile presentation", () => {
  assert.match(
    attendanceTableSource,
    /const toolbarClassName =\s*"items-stretch[^"]*\[&>\[data-slot=toolbar-group\]\]:w-full[^"]*"[\s\S]*const toolbarFilters =[\s\S]*<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">/,
    "calendar filters should form a compact two-column control group on phones",
  );
  assert.match(
    attendanceTableSource,
    /triggerClassName="col-span-2 w-full sm:w-64"[\s\S]*className="col-span-2 w-full sm:w-44"/,
    "employee and attention scope controls should occupy complete mobile rows",
  );
  assert.match(
    attendanceCalendarSource,
    /attentionOnly && !hasAttention \? null[\s\S]*className="min-w-0 overflow-hidden"/,
    "an empty attention scope should not render a blank seven-column grid",
  );
  assert.doesNotMatch(
    attendanceCalendarSource,
    /min-w-112/,
    "the phone calendar must fit its owning card instead of relying on horizontal scrolling",
  );
  assert.match(
    attendanceCalendarSource,
    /className="flex min-h-24 min-w-0[^"]*sm:min-h-28[^"]*"/,
    "calendar cells should reserve an even visual height for every day",
  );
  assert.match(
    attendanceCalendarSource,
    /const calendarDetailLabel =[\s\S]*calendarDetailTone[\s\S]*min-h-8 line-clamp-2 text-xs leading-4/,
    "calendar cells should reserve a fixed two-line summary and one status line",
  );
});

test("calendar day detail is a responsive contextual sheet with URL recovery", () => {
  assert.match(
    attendanceTableSource,
    /function selectCalendarDay\(date: string \| null\)[\s\S]*syncAttendanceUrl\([\s\S]*date,[\s\S]*selectedEmployeeId/,
    "closing the calendar detail should remove its deep-link day state",
  );
  assert.match(
    attendanceTableSource,
    /nextView === "calendar" && nextDay\) params\.set\("day", nextDay\)/,
    "calendar day deep links stay in owned timesheet URL keys",
  );
  assert.match(
    attendanceTableSource,
    /<Sheet[\s\S]*open=\{selectedDay !== null\}[\s\S]*onOpenChange=\{\(open\) => \{[\s\S]*selectCalendarDay\(null\)/,
    "selected calendar days should open in an accessible Sheet that can close safely",
  );
  assert.match(
    attendanceTableSource,
    /side=\{isCalendarDetailTouch \? "bottom" : "right"\}/,
    "calendar detail should preserve a touch-first bottom sheet and desktop side panel",
  );
  assert.match(
    attendanceTableSource,
    /className="max-h-dvh-95 overflow-hidden bg-background p-0 data-\[side=right\]:lg:w-1\/2 data-\[side=right\]:lg:max-w-none"/,
    "desktop calendar detail should use half of the viewport instead of the shared narrow sheet cap",
  );
  assert.match(
    attendanceTableSource,
    /<DetailView[\s\S]*data=\{selectedDayRecords\}[\s\S]*compact[\s\S]*function DetailView\([\s\S]*compact = false[\s\S]*mobileBreakpoint=\{compact \? 10_000 : undefined\}/,
    "the calendar detail should keep responsive cards inside the desktop review panel",
  );
  assert.match(
    attendanceTableSource,
    /attendanceCopy\.checkIn[\s\S]{0,80}formatVNTime\(record\.check_in\)[\s\S]{0,160}attendanceCopy\.checkOut[\s\S]{0,80}formatVNTime\(record\.check_out\)/,
    "calendar detail cards should retain the in/out times needed for attendance review",
  );
  assert.match(
    attendanceTableSource,
    /calculateAttendanceWorkHours\(\s*record\.check_in,\s*record\.check_out\s*\)[\s\S]*countCompletedShiftWorkdays\(\s*selectedDayClosedShifts,?\s*\)/,
    "the day detail summary should derive hours and workdays from recorded attendance",
  );
  assert.match(
    attendanceTableSource,
    /leave\.start_date <= selectedDay && leave\.end_date >= selectedDay/,
    "the selected day should surface only an overlapping leave range",
  );
});

test("branch manager attendance and leave reviews remain branch-scoped", () => {
  assert.match(
    hrActionsSource,
    /const attendanceClient =\s*claims\.user_role === "branch_manager" \? createServiceClient\(\) : supabase;/,
    "Branch manager attendance reads should use a service client after action-level branch authorization",
  );
  assert.match(
    hrActionsSource,
    /let query = attendanceClient\s*\.from\("attendance_records"\)[\s\S]*employees \(/,
    "Attendance reads embed employees through the branch-gated service client",
  );
  assert.match(
    leaveRequestActionsSource,
    /const REVIEW_ROLES: readonly StaffRole\[\] = \["owner", "branch_manager"\]/,
    "Leave review actions must include the branch operator role",
  );
  assert.doesNotMatch(
    leaveRequestActionsSource,
    /createServiceClient/,
    "Leave reviews must stay on the authenticated RLS/PBAC client",
  );
});
