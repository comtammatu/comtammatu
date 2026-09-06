import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ATTENDANCE_DIRECT_CHECKOUT_POSITION_CODES,
  canDirectlyCheckoutAttendance,
} from "@comtammatu/shared/auth";
import { readActiveMigrationSql } from "./_lib/active-sql";

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

test("office and management positions can close their own attendance directly", () => {
  assert.deepEqual(ATTENDANCE_DIRECT_CHECKOUT_POSITION_CODES, [
    "branch_manager",
    "hr_manager",
    "central_supply_ops",
    "central_kitchen_lead",
  ]);
  assert.equal(
    canDirectlyCheckoutAttendance({
      branchId: null,
      positionCode: "accountant",
    }),
    true,
  );
  assert.equal(
    canDirectlyCheckoutAttendance({
      branchId: null,
      positionCode: "office_staff",
    }),
    true,
  );
  assert.equal(
    canDirectlyCheckoutAttendance({
      branchId: 47,
      positionCode: "branch_manager",
    }),
    true,
  );
  assert.equal(
    canDirectlyCheckoutAttendance({
      branchId: 47,
      positionCode: "hr_manager",
    }),
    true,
  );
  assert.equal(
    canDirectlyCheckoutAttendance({ branchId: 47, positionCode: "cashier" }),
    false,
  );
  assert.equal(
    canDirectlyCheckoutAttendance({ branchId: null, positionCode: "owner" }),
    false,
  );
  assert.equal(
    canDirectlyCheckoutAttendance({ branchId: null, positionCode: null }),
    false,
  );
});

test("direct attendance checkout uses the authenticated guarded RPC", () => {
  assert.match(
    employeeClockActionSource,
    /canDirectlyCheckoutAttendance\([\s\S]*claims\.position_code/,
    "The action must use canonical position and live branch scope",
  );
  assert.match(
    employeeClockActionSource,
    /ctx\.supabase\.rpc\(\s*"self_service_clock_out"/,
    "Direct checkout must be enforced by the authenticated database RPC",
  );
  assert.match(
    readActiveMigrationSql(),
    /CREATE OR REPLACE FUNCTION public\.self_service_clock_out\(\s*p_attendance_id bigint\s*\)/,
    "The database must expose a dedicated guarded direct-checkout RPC",
  );
  assert.doesNotMatch(employeeClockPageSource, /DEFAULT_CLOCK_ROUTES|"\/hr"/);
});

test("Staff checkout request stays single tap while direct checkout confirms", () => {
  const submitCheckoutBlock = employeeClockClientSource.match(
    /const submitCheckout = useCallback\(async \(\) => \{[\s\S]*?\n\s*\]\);/,
  )?.[0];
  assert.ok(submitCheckoutBlock, "Clock client should define submitCheckout");
  assert.match(
    submitCheckoutBlock,
    /if \(directCheckoutAllowed\) \{[\s\S]*await confirm\(/,
    "Direct checkout should keep confirmation because it writes check_out immediately",
  );
  assert.doesNotMatch(
    submitCheckoutBlock,
    /Gửi yêu cầu kết ca\?/,
    "Staff checkout request should not show an extra confirmation dialog",
  );
  assert.match(
    submitCheckoutBlock,
    /directCheckoutAllowed\s*\?\s*await clockOutDirectShift\(\{ attendanceId \}\)\s*:\s*await requestCheckoutApproval\(\{ attendanceId \}\)/,
    "Staff and direct checkout should target the current attendance record",
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

test("checkout request and reject stay on the employee ownership contract", () => {
  assert.match(
    employeeClockActionSource,
    /async function resolveAssignedShiftForEmployee[\s\S]*\.from\("shift_assignments" as never\)/,
    "Clock-in should keep the assigned-shift resolver",
  );
  assert.match(
    employeeClockActionSource,
    /export async function requestCheckoutApproval[\s\S]*\.eq\("employee_id", ctx\.employeeId\)[\s\S]*\.eq\("tenant_id", ctx\.claims\.tenant_id\)[\s\S]*\.eq\("id", parsed\.data\.attendanceId\)/,
    "Checkout request must only target the caller-owned attendance id",
  );
  assert.match(
    employeeClockActionSource,
    /ctx\.supabase\.rpc\(\s*"reject_employee_clock_out"[\s\S]*p_attendance_id: parsed\.data\.attendanceId/,
    "Checkout reject should use the same DB-side hierarchy contract as approval",
  );
});
