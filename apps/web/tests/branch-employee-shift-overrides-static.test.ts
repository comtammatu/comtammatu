import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const root = join(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("Branch manager employee shift-task overrides", () => {
  test("permission catalog exposes branch-scoped override key", () => {
    const permissions = read("packages/shared/src/auth/permissions.ts");
    assert.match(
      permissions,
      /HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES:\s*"hr:manage_employee_shift_overrides"/,
    );
    assert.match(permissions, /PERMISSION_KEY_COUNT = 109/);

    const migration = read(
      "supabase/migrations/20260808162041_branch_manager_employee_shift_task_overrides.sql",
    );
    assert.match(migration, /hr:manage_employee_shift_overrides/);
    assert.match(
      migration,
      /Manage employee-specific shift task overrides at a branch',\s*'branch',\s*true/,
    );
    assert.match(migration, /is_delegable_to_staff\s*=\s*EXCLUDED\.is_delegable_to_staff/);
    assert.match(
      migration,
      /\('branch_manager',\s*'hr:manage_employee_shift_overrides'\)/,
    );
    assert.match(
      migration,
      /has_permission\(\s*NULL,\s*'hr:manage_position_tasks'\s*\)/,
    );
    assert.match(
      migration,
      /has_permission\(\s*v_branch_id,\s*'hr:manage_employee_shift_overrides'\s*\)/,
    );
    assert.doesNotMatch(
      migration,
      /\('branch_manager',\s*'hr:manage_position_tasks'\)/,
    );
  });

  test("branch members surface wires override actions without position CRUD", () => {
    const membersClient = read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/members-client.tsx",
    );
    const membersContent = read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/members-content.tsx",
    );
    const actions = read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/employee-tasks-actions.ts",
    );
    const sheet = read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/branch-employee-tasks-sheet.tsx",
    );
    const operatorMessages = read("apps/web/lib/messages/operator.ts");

    assert.match(
      membersContent,
      /PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES/,
    );
    assert.match(membersContent, /canManageEmployeeOverrides/);
    assert.match(membersClient, /BranchEmployeeTasksSheet/);
    assert.match(membersClient, /detailCopy\.openShiftTasks/);
    assert.match(operatorMessages, /openShiftTasks:\s*"Việc trong ca"/);

    assert.match(actions, /export const loadBranchEmployeeShiftTasks/);
    assert.match(actions, /export const saveBranchEmployeeShiftTaskOverride/);
    assert.match(actions, /export const clearBranchEmployeeShiftTaskOverride/);
    assert.match(
      actions,
      /PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES/,
    );
    assert.match(actions, /requireBranchScope:\s*true/);
    assert.match(actions, /save_employee_shift_task_override/);
    assert.match(actions, /clear_employee_shift_task_override/);
    assert.doesNotMatch(actions, /upsert_position_shift_tasks/);
    assert.doesNotMatch(actions, /savePositionTasks/);
    assert.doesNotMatch(sheet, /upsert_position_shift_tasks/);
    assert.doesNotMatch(sheet, /savePositionTasks/);
    assert.doesNotMatch(sheet, /EmployeeTaskOverrideDialog/);
    assert.doesNotMatch(sheet, /rounded-md border p-3/);
    assert.match(sheet, /<AppSheet/);
    assert.match(sheet, /ItemGroup/);
    assert.match(sheet, /copy\.phaseLabel/);
  });

  test("ADR 0022 records Company HR vs Branch people-ops split", () => {
    const adr = read(
      "docs/plan/adr/0022-hr-control-surface-information-architecture.md",
    );
    assert.match(adr, /Branch people ops[\s\S]*`\/br\/\[branchId\]\/team`/);
    assert.match(adr, /Company HR[\s\S]*`\/hr\/\*`/);
    assert.match(adr, /HR positions are not a second authorization layer/);
  });
});
