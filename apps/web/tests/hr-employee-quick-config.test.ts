import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("employee list exposes capability-gated quick configuration", () => {
  const table = read("app/(protected)/hr/employee-table.tsx");
  const page = read("app/(protected)/hr/page.tsx");
  const tasks = read("app/(protected)/hr/position-tasks-client.tsx");

  for (const key of ["role", "branch", "todayShift", "shiftTasks"]) {
    assert.match(table, new RegExp(`key: "${key}"`));
  }
  assert.match(
    table,
    /updateEmployee\(\{ employeeId: employee\.id, positionCode \}\)/,
  );
  assert.match(
    table,
    /branchId: value === OFFICE_VALUE \? null : Number\(value\)/,
  );
  assert.match(table, /setEmployeeTodayShiftAssignment/);
  assert.match(table, /<EmployeeTaskOverrideDialog/);
  assert.match(table, /<AppDialog[\s\S]*quickCopy\.usePositionTasksTitle/);
  assert.match(tasks, /export function EmployeeTaskOverrideDialog/);
  assert.match(page, /PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE/);
  assert.match(page, /PERMISSION_KEYS\.HR_ASSIGN_SHIFT/);
  assert.match(page, /PERMISSION_KEYS\.HR_MANAGE_POSITION_TASKS/);
  assert.match(
    page,
    /const canQuickAssignShift = canAssignShift && claims\.user_role === "owner"/,
  );
});

test("today quick assignment preserves the rest of the week", () => {
  const actions = read("lib/hr/roster/actions.ts");
  const body = actions.slice(
    actions.indexOf("export const setEmployeeTodayShiftAssignment"),
    actions.indexOf("export const copyRosterWeek"),
  );

  assert.match(body, /getVNDateString\(\)/);
  assert.match(body, /loadRosterWeekData/);
  assert.match(body, /assignment\.employeeId !== data\.employeeId/);
  assert.match(body, /assignment\.workDate !== today/);
  assert.match(body, /reconcile_shift_assignments_week/);
  assert.match(body, /Không thể đổi ca sau khi nhân viên đã chấm công hôm nay/);
  assert.doesNotMatch(
    body,
    /\.from\("shift_assignments"[\s\S]*\.(insert|upsert|update|delete)\(/,
  );
});
