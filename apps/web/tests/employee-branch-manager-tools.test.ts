import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const employeeHomeSource = readFileSync(
  join(process.cwd(), "app/(protected)/employee/page.tsx"),
  "utf8",
);
const employeeProfileSource = readFileSync(
  join(process.cwd(), "app/(protected)/employee/profile/page.tsx"),
  "utf8",
);
const employeeClockActionSource = readFileSync(
  join(process.cwd(), "app/(protected)/employee/clock/actions.ts"),
  "utf8",
);
const employeeClockPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/employee/clock/page.tsx"),
  "utf8",
);
const employeeTasksPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/employee/tasks/page.tsx"),
  "utf8",
);

test("Employee home keeps Branch Manager tools out of the hot path", () => {
  assert.doesNotMatch(
    employeeHomeSource,
    /employee_checkout_approvals|MANAGER_LINKS|managerTools/,
    "Employee home must stay focused on the personal next action, not manager tools",
  );
});

test("Employee profile launcher is ACL-driven for all non-admin roles", () => {
  assert.match(
    employeeProfileSource,
    /const effectiveBranchId = ctx\?\.branchId \?\? claims\.branch_id \?\? null;/,
    "Workspace launcher must fall back to JWT branch scope when employee context is missing",
  );
  assert.match(
    employeeProfileSource,
    /resolveQuickLaunchGroups\(claims\.user_role, effectiveBranchId\)/,
    "Workspace launcher must derive direct links from the shared ACL nav resolvers",
  );
  assert.match(
    employeeProfileSource,
    /isAdminRole\(claims\.user_role\)/,
    "Workspace launcher must skip admin roles (they land in Tenant Command)",
  );
  assert.match(
    employeeProfileSource,
    /title=\{copy\.workspaceLauncherTitle\}[\s\S]*links=\{workspaceLinks\}/,
    "Workspace launcher should render through the shared EmployeeActionSection",
  );
  assert.doesNotMatch(
    employeeProfileSource,
    /MANAGER_LINKS|ManagerToolsSheet/,
    "Hand-maintained MANAGER_LINKS array must be gone — links come from the ACL resolvers",
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
    /state\.managerAttendanceOnly \? "\/hr" : "\/employee\/tasks"/,
    "Branch Manager clock page should link back to HR management instead of tasks",
  );
  assert.match(
    employeeTasksPageSource,
    /state\.managerAttendanceOnly[\s\S]*managerTaskCopy\.noTaskTitle/,
    "Branch Manager tasks route should not render the personal checklist",
  );
});
