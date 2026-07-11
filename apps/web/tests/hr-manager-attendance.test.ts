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

test("HR attendance is a manager read surface for clock in and clock out", () => {
  assert.match(
    hrPageSource,
    /isBranchManager=\{isBranchManager\}/,
    "HR page should pass the role flag to the client that owns the page header",
  );
  assert.match(
    hrClientSource,
    /isBranchManager[\s\S]{0,40}branchManagerTitle[\s\S]{0,40}ownerTitle/,
    "HR client should read its role-specific title from the HR message dictionary",
  );
  assert.match(
    hrMessagesSource,
    /branchManagerTitle:\s*"Ngày công"/,
    "Branch Manager HR page should read as workday management",
  );
  assert.match(
    hrMessagesSource,
    /ownerTitle:\s*"Nhân sự"/,
    "Owner HR page should keep the HR workspace title",
  );
  assert.match(
    hrMessagesSource,
    /attendance:\s*"Ngày công"/,
    "HR attendance tab should use Ngày công wording",
  );
  assert.match(
    hrClientSource,
    /value: "attendance",\s*label: copy\.tabs\.attendance/,
    "HR attendance tab should read from the HR message dictionary",
  );
  assert.match(
    hrClientSource,
    /value: "setup",\s*label: copy\.tabs\.setup/,
    "HR setup should group shift and checklist configuration",
  );
  assert.doesNotMatch(
    hrClientSource,
    /value="leave"/,
    "Leave requests should sit inside the day-work flow instead of a separate top-level tab",
  );
  assert.match(
    hrClientSource,
    /<TabsContent value="attendance"[\s\S]*<AttendanceTable branches=\{branches\} \/>[\s\S]*<LeaveRequestsTable branches=\{branches\} \/>/,
    "Day-work tab should group attendance and leave review together",
  );
  assert.match(
    attendanceTableSource,
    /<Button[\s\S]*attendanceCopy\.clockView[\s\S]*<\/Button>/,
    "Attendance detail view should focus on clock-in and clock-out",
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
    /supabase\.rpc\(\s*"admin_force_close_attendance"/,
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

test("branch manager HR reads survive owner-only personnel RLS", () => {
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
    /import \{ createServiceClient \} from "@comtammatu\/database\/supabase\/service";/,
    "Leave review actions should have an explicit service client for branch-manager reads",
  );
  assert.match(
    leaveRequestActionsSource,
    /const leaveClient =\s*claims\.user_role === "branch_manager" \? createServiceClient\(\) : supabase;/,
    "Branch manager leave reads should use a service client after action-level branch authorization",
  );
  assert.match(
    leaveRequestActionsSource,
    /await leaveClient\s*\.from\("leave_requests"\)[\s\S]*employees \(/,
    "Leave review reads embed employees through the branch-gated service client",
  );
});
