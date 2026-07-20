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
  join(process.cwd(), "app/(protected)/hr/attendance-table.tsx"),
  "utf8",
);
const hrActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/actions.ts"),
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

test("HR attendance is a dedicated owner surface for clock in and clock out", () => {
  assert.doesNotMatch(
    hrPageSource,
    /AttendanceTable|LeaveRequestsTable|AppPageTabs/,
    "the employee landing must not combine attendance, leave and payroll tabs",
  );
  assert.match(
    hrClientSource,
    /title=\{workspaceCopy\.ownerTitle\}/,
    "the employee landing should use the owner HR workspace title",
  );
  assert.match(
    attendancePageSource,
    /<AttendanceTable branches=\{branches\} \/>[\s\S]*<LeaveRequestsTable branches=\{branches\} \/>/,
    "day-work and leave review should share their dedicated route",
  );
  assert.match(
    hrMessagesSource,
    /ownerTitle:\s*"Hồ sơ nhân sự"/,
    "Owner HR landing should name the employee-record surface precisely",
  );
  assert.match(
    hrMessagesSource,
    /attendance:\s*"Ngày công"/,
    "HR attendance tab should use Ngày công wording",
  );
  assert.match(
    attendanceTableSource,
    /<AppToolbar[\s\S]*<ToggleGroup[\s\S]*attendanceCopy\.summaryView[\s\S]*attendanceCopy\.clockView/,
    "attendance filters and view selection must use the shared toolbar and button group",
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
    /getAttendancePhotoUrl\(\{\s*attendanceId: record\.id,\s*branchId,\s*\}\)/,
    "Attendance table should request a branch-scoped signed URL per attendance row",
  );
  assert.match(
    attendanceTableSource,
    /forceCloseStaleAttendance\(\{\s*attendanceId: closingRecord\.id,\s*branchId,\s*note,\s*\}\)/,
    "Attendance stale-close mutation should stay scoped to the selected branch",
  );
  assert.match(
    attendanceTableSource,
    /<AppDialog[\s\S]*title=\{attendanceCopy\.photoDialogTitle\}/,
    "Attendance photo preview should render in an accessible dialog",
  );
  assert.match(
    attendanceTableSource,
    /function canForceCloseRecord[\s\S]*isStaleOpenRecord\(record\)/,
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
    attendanceTableSource.indexOf("<AppToolbar") <
      attendanceTableSource.indexOf("<SummaryView data={summary} />"),
    "the filter toolbar must precede the data table",
  );
  assert.match(
    attendanceTableSource,
    /<AppSection\s+title=\{messages\.hr\.client\.attendanceTitle\}[\s\S]*<SummaryView data=\{summary\} \/>/,
    "attendance data must render in its own section",
  );
  assert.doesNotMatch(
    attendanceTableSource,
    /fetchApprovedLeaveMonth|ApprovedLeavePanel/,
    "attendance must not render approved leave data",
  );
  assert.match(
    leaveRequestsTableSource,
    /const approvedMonthRows = useMemo\([\s\S]*request\.status === "approved"[\s\S]*request\.start_date <= endDate[\s\S]*request\.end_date >= startDate/,
    "leave approval history must derive approved rows for the selected month",
  );
  assert.match(
    leaveRequestsTableSource,
    /value: "approved-month",[\s\S]*copy\.approvedMonthTab[\s\S]*<TabsContent value="approved-month">[\s\S]*<AppToolbar[\s\S]*<AppSection\s+title=\{copy\.approvedMonthTitle\}[\s\S]*data=\{approvedMonthRows\}/,
    "approved monthly leave needs its own view, with filters before its data section",
  );
  assert.match(
    leaveRequestsTableSource,
    /<AppPageTabs\s+defaultValue="pending"\s+paramKey="leave-view"/,
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

test("branch manager attendance and leave reviews remain branch-scoped", () => {
  assert.match(
    hrActionsSource,
    /const attendanceClient =\s*claims\.user_role === "branch_manager" \? createServiceClient\(\) : supabase;/,
    "Branch manager attendance reads should use a service client after action-level branch authorization",
  );
  assert.match(
    hrActionsSource,
    /await attendanceClient\s*\.from\("attendance_records"\)[\s\S]*employees \(/,
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
