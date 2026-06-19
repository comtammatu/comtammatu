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

test("HR attendance is a manager read surface for clock in and clock out", () => {
  assert.match(
    hrPageSource,
    /title=\{isBranchManager \? copy\.branchManagerTitle : copy\.ownerTitle\}/,
    "HR page should read its role-specific title from the HR message dictionary",
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
    /<TabsTrigger value="attendance">\{copy\.tabs\.attendance\}<\/TabsTrigger>/,
    "HR attendance tab should read from the HR message dictionary",
  );
  assert.match(
    hrClientSource,
    /<TabsTrigger value="setup">\{copy\.tabs\.setup\}<\/TabsTrigger>/,
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
    /<TableHead>\{attendanceCopy\.photo\}<\/TableHead>/,
    "Attendance detail rows should expose a manager photo-review column",
  );
  assert.match(
    attendanceTableSource,
    /getAttendancePhotoUrl\(\{\s*attendanceId: record\.id,\s*\}\)/,
    "Attendance table should request a checked signed URL per attendance row",
  );
  assert.match(
    attendanceTableSource,
    /<DialogTitle>\{attendanceCopy\.photoDialogTitle\}<\/DialogTitle>/,
    "Attendance photo preview should render in an accessible dialog",
  );

  for (const forbidden of [
    "updateAttendanceStatus",
    "handleStatusChange",
    "onStatusChange",
    'value={record.status}',
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
