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
  assert.match(table, /handlePositionChange\(employee, positionCode\)/);
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

test("position quick change supports cross-site employee transfers", () => {
  const table = read("app/(protected)/hr/employee-table.tsx");
  const positionSelect = table.slice(
    table.indexOf("function renderPositionSelect"),
    table.indexOf("function renderBranchSelect"),
  );
  const positionChange = table.slice(
    table.indexOf("function handlePositionChange"),
    table.indexOf("function renderPositionSelect"),
  );

  assert.doesNotMatch(positionSelect, /compatiblePositions\(employee\)/);
  assert.match(positionSelect, /positionOptions\.map/);
  assert.match(positionSelect, /handlePositionChange\(employee, positionCode\)/);
  assert.match(positionChange, /requiredBranchKindForPositionCode/);
  assert.match(
    positionChange,
    /updateEmployee\(\{[\s\S]*positionCode,[\s\S]*branchId:/,
  );
  assert.match(table, /quickCopy\.transferWorkplaceTitle/);
});

test("today quick assignment preserves the rest of the week", () => {
  const actions = read("lib/hr/roster/actions.ts");
  const body = actions.slice(
    actions.indexOf("export const setEmployeeTodayShiftAssignment"),
    actions.indexOf("export const copyRosterWeek"),
  );

  assert.match(body, /getVNDateString\(\)/);
  assert.match(body, /loadRosterWeekData/);
  assert.match(body, /alreadyAssigned/);
  assert.match(body, /punchedShiftIds/);
  assert.match(body, /reconcile_shift_assignments_week/);
  assert.doesNotMatch(
    body,
    /Không thể đổi ca sau khi nhân viên đã chấm công hôm nay/,
  );
  assert.doesNotMatch(
    body,
    /\.from\("shift_assignments"[\s\S]*\.(insert|upsert|update|delete)\(/,
  );
});
