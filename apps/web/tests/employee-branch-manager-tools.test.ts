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
const employeeProfileManagerSheetSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/employee/profile/manager-tools-sheet.tsx",
  ),
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

test("Employee profile exposes Branch Manager tools outside personal attendance state", () => {
  assert.match(
    employeeProfileSource,
    /const effectiveBranchId = ctx\?\.branchId \?\? claims\.branch_id \?\? null;/,
    "Branch Manager tools must fall back to JWT branch scope when employee context is missing",
  );
  assert.match(
    employeeProfileSource,
    /claims\.user_role === "branch_manager"/,
    "Branch Manager visibility must be explicit and role-scoped",
  );
  assert.match(
    employeeProfileSource,
    /const managerLinks(?::[^=]+)? =[\s\S]*canAccess\(claims\.user_role, link\.moduleKey\)/,
    "Branch Manager tools should still flow through the shared ACL",
  );
  assert.match(
    employeeProfileSource,
    /<ManagerToolsSheet links=\{managerLinks\} \/>/,
    "Branch Manager tools should be collapsed behind the Profile manager sheet row",
  );
  assert.match(
    employeeProfileManagerSheetSource,
    /Sheet[\s\S]*SheetTrigger[\s\S]*SheetContent/,
    "Collapsed manager tools row should open a Sheet with the approved links",
  );
  assert.match(
    employeeProfileManagerSheetSource,
    /copy\.managerToolsEntryTitle/,
    "Collapsed manager tools row should use the compact Profile entry label",
  );

  const managerToolsBlock =
    employeeProfileSource.match(
      /const managerLinks(?::[^=]+)? =[\s\S]*?: \[\];\n/,
    )?.[0] ?? "";
  assert.doesNotMatch(
    managerToolsBlock,
    /attendance/,
    "Branch Manager management links must not disappear when the manager has not clocked in",
  );

  for (const expected of [
    'moduleKey: "employee_checkout_approvals"',
    'moduleKey: "hr"',
    'moduleKey: "branch_settings"',
  ]) {
    assert.ok(
      employeeProfileSource.includes(expected),
      `expected Branch Manager entry point ${expected}`,
    );
  }
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
