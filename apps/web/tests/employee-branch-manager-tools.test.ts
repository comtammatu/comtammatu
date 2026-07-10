import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const employeeHomeSource = readFileSync(
  join(process.cwd(), "lib/staff-runtime/page.tsx"),
  "utf8",
);
const employeeProfileSource = readFileSync(
  join(process.cwd(), "lib/staff-runtime/profile/page.tsx"),
  "utf8",
);
const employeeClockActionSource = readFileSync(
  join(process.cwd(), "lib/staff-runtime/clock/actions.ts"),
  "utf8",
);
const employeeClockClientSource = readFileSync(
  join(process.cwd(), "lib/staff-runtime/clock/clock-client.tsx"),
  "utf8",
);
const employeeClockPageSource = readFileSync(
  join(process.cwd(), "lib/staff-runtime/clock/page.tsx"),
  "utf8",
);

test("Employee home keeps Branch Manager tools out of the hot path", () => {
  assert.doesNotMatch(
    employeeHomeSource,
    /employee_checkout_approvals|MANAGER_LINKS|managerTools/,
    "Employee home must stay focused on the personal next action, not manager tools",
  );
});

test("Employee profile stays focused on self-service actions", () => {
  assert.match(
    employeeProfileSource,
    /const effectiveBranchId = ctx\?\.branchId \?\? claims\.branch_id \?\? null;/,
    "Profile self-service actions must fall back to JWT branch scope when employee context is missing",
  );
  assert.match(
    employeeProfileSource,
    /<ProfileEditAction[\s\S]*branchId=\{effectiveBranchId\}/,
    "Profile edit should keep the effective branch scope",
  );
  assert.match(
    employeeProfileSource,
    /<ProfileAvatarAction[\s\S]*branchId=\{effectiveBranchId\}/,
    "Avatar upload should keep the effective branch scope",
  );
  assert.match(
    employeeProfileSource,
    /<form action="\/api\/auth\/signout" method="post">/,
    "Profile should keep sign-out as the only navigation-like action",
  );
  assert.doesNotMatch(
    employeeProfileSource,
    /resolveQuickLaunchGroups|workspaceLinks|workspaceLauncherTitle|MANAGER_LINKS|ManagerToolsSheet|EmployeeHomePageContent|EmployeeActionSection/,
    "Profile must not become a workspace launcher or manager-tools surface",
  );
});

test("Branch Manager self-attendance is only clock in and clock out", () => {
  assert.match(
    employeeHomeSource,
    /state\.managerAttendanceOnly \? copy\.clockOutDirect : copy\.clockOut/,
    "Branch Manager home CTA should go directly to clock-out instead of approval checkout copy",
  );
  assert.match(
    employeeHomeSource,
    /const todaySummaryItems = state\.managerAttendanceOnly[\s\S]*copy\.checkInShort[\s\S]*copy\.checkOutShort/,
    "Branch Manager home should summarize the direct attendance state without a personal checklist rail",
  );
  assert.match(
    employeeClockActionSource,
    /MANAGER_SIMPLE_ATTENDANCE_ROLES[\s\S]*"branch_manager"/,
    "Branch Manager direct attendance must be role-explicit",
  );
  assert.match(
    employeeClockActionSource,
    /managerAttendanceOnly[\s\S]*\.from\("attendance_records"\)[\s\S]*\.insert\(/,
    "Branch Manager clock-in must skip role checklist snapshot",
  );
  assert.match(
    employeeClockActionSource,
    /export async function clockOutManagerShift[\s\S]*checkout_requested_at: null[\s\S]*\.eq\("employee_id", ctx\.employeeId\)[\s\S]*\.eq\("branch_id", ctx\.branchId\)/,
    "Branch Manager direct checkout must only close their own assigned-branch attendance and clear approval pending fields",
  );
  assert.match(
    employeeClockPageSource,
    /managerHr: "\/hr"[\s\S]*state\.managerAttendanceOnly \? routes\.managerHr : routes\.tasks/,
    "Branch Manager clock page should link back to HR management by default instead of tasks",
  );
});

test("Staff checkout request stays single tap while manager direct checkout confirms", () => {
  const submitCheckoutBlock = employeeClockClientSource.match(
    /const submitCheckout = useCallback\(async \(\) => \{[\s\S]*?\n\s*\]\);/,
  )?.[0];
  assert.ok(submitCheckoutBlock, "Clock client should define submitCheckout");
  assert.match(
    submitCheckoutBlock,
    /if \(managerAttendanceOnly\) \{[\s\S]*await confirm\(/,
    "Manager direct checkout should keep confirmation because it writes check_out immediately",
  );
  assert.doesNotMatch(
    submitCheckoutBlock,
    /Gửi yêu cầu kết ca\?/,
    "Staff checkout request should not show an extra confirmation dialog",
  );
  assert.match(
    submitCheckoutBlock,
    /managerAttendanceOnly\s*\?\s*await clockOutManagerShift\(\{ attendanceId \}\)\s*:\s*await requestCheckoutApproval\(\{ attendanceId \}\)/,
    "Staff and manager checkout should target the current attendance record",
  );
  assert.match(
    employeeClockActionSource,
    /const attendanceActionSchema = z\.object\(\{[\s\S]*attendanceId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
    "Checkout actions should validate the attendance id at the trust boundary",
  );
  assert.doesNotMatch(
    employeeClockActionSource,
    /\.from\("attendance_checklist_items"\)[\s\S]*\.eq\("task_kind", "consumption_report"\)|consumptionReport\?\.status !== "approved"|consumptionReport\?\.status !== "applied"/,
    "Checkout approval should not require a consumption report before approving checkout",
  );
});

test("checkout request and reject stay on the current branch shift contract", () => {
  assert.match(
    employeeClockActionSource,
    /async function resolveCurrentShiftIdForEmployee[\s\S]*resolveDefaultShiftId/,
    "Checkout should reuse the same current-shift resolver as clock-in",
  );
  assert.match(
    employeeClockActionSource,
    /export async function requestCheckoutApproval[\s\S]*\.eq\("branch_id", ctx\.branchId\)[\s\S]*\.eq\("date", today\)[\s\S]*\.eq\("shift_id", currentShiftId\)/,
    "Checkout request must not close stale or other-branch attendance rows",
  );
  assert.match(
    employeeClockActionSource,
    /branch_manager_reject_employee_clock_out[\s\S]*p_rejected_by: ctx\.user\.id/,
    "Checkout reject should use the same DB-side hierarchy contract as approval",
  );
});
