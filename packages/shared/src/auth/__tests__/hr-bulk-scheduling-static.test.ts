import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("HR bulk scheduling migration uses service-role atomic RPCs", () => {
  const migration = read(
    "supabase/migrations/20260609110000_hr_bulk_scheduling.sql",
  );

  for (const expected of [
    "CREATE OR REPLACE FUNCTION public.bulk_upsert_shift_assignments",
    "CREATE OR REPLACE FUNCTION public.bulk_delete_future_shift_assignments",
    "CREATE OR REPLACE FUNCTION public.copy_shift_assignments_week",
    "p_mode text DEFAULT 'skip_existing'",
    "ON CONFLICT (employee_id, date, tenant_id) DO NOTHING",
    "REVOKE ALL ON FUNCTION public.bulk_upsert_shift_assignments",
    "REVOKE ALL ON FUNCTION public.copy_shift_assignments_week",
    "REVOKE ALL ON FUNCTION public.bulk_delete_future_shift_assignments",
    "FROM PUBLIC, anon, authenticated",
    "TO service_role",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  assert.ok(
    migration.includes("v_mode NOT IN ('skip_existing', 'replace_future')"),
    "expected RPC mode validation",
  );
  assert.ok(
    migration.includes("e.is_active = true") &&
      migration.includes("COALESCE(s.is_active, true) = true") &&
      migration.includes("p.branch_id = p_branch_id"),
    "expected RPC to validate active employee, active shift and branch scope",
  );
});

test("HR shift assignment actions expose bulk workflow through RPCs", () => {
  const actions = read(
    "apps/web/app/(protected)/hr/shift-assignment-actions.ts",
  );

  for (const expected of [
    "export const bulkAssignShifts",
    "export const bulkDeleteFutureAssignments",
    "export const updateShiftAssignment",
    "export const copyPreviousWeekAssignments",
    ".rpc(",
    '"bulk_upsert_shift_assignments"',
    '"bulk_delete_future_shift_assignments"',
    '"copy_shift_assignments_week"',
    'z.enum(["skip_existing", "replace_future"])',
    "createServiceClient()",
    "revalidateHrSchedulePaths()",
  ]) {
    assert.ok(actions.includes(expected), `expected ${expected}`);
  }
});

test("HR scheduling UI provides multi-employee calendar workflow", () => {
  const ui = read("apps/web/app/(protected)/hr/shift-assignments-table.tsx");
  const shiftsTable = read("apps/web/app/(protected)/hr/shifts-table.tsx");
  const shiftDialog = read("apps/web/app/(protected)/hr/shift-form-dialog.tsx");

  for (const expected of [
    "Phân ca hàng loạt",
    "SheetTitle",
    "Checkbox",
    "ToggleGroup",
    "Copy tuần trước",
    "bulkAssignShifts",
    "bulkDeleteFutureAssignments",
    "copyPreviousWeekAssignments",
    "updateShiftAssignment",
    "selectedEmployeeIds",
    "selectedWeekdays",
    "Theo ca",
    "Theo nhân viên",
    "replace_future",
    "skip_existing",
  ]) {
    assert.ok(ui.includes(expected), `expected ${expected}`);
  }

  for (const expected of [
    "updateShift",
    "deactivateShift",
    "future_assignment_count",
    "Ngưng dùng",
  ]) {
    assert.ok(
      shiftsTable.includes(expected) || shiftDialog.includes(expected),
      `expected ${expected}`,
    );
  }
});

test("Branch Manager enters branch-scoped HR shifts without payroll access", () => {
  const moduleAcl = read("packages/shared/src/auth/module-acl.ts");
  const routeResolution = read("packages/shared/src/auth/route-resolution.ts");
  const hrPage = read("apps/web/app/(protected)/hr/page.tsx");
  const hrClient = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const employeeHome = read("apps/web/app/(protected)/employee/page.tsx");

  assert.ok(
    moduleAcl.includes(
      'allowedRoles: ["owner", "super_manager", "branch_manager"]',
    ),
    "expected /hr module to include branch_manager",
  );
  assert.ok(
    moduleAcl.includes("hr_payroll") &&
      moduleAcl.includes('path: "/hr/payroll"') &&
      moduleAcl.includes('allowedRoles: ["owner", "super_manager"]'),
    "expected /hr/payroll to stay owner/super_manager only",
  );

  const payrollIndex = routeResolution.indexOf(
    'resolvedPathname.startsWith("/hr/payroll")',
  );
  const hrIndex = routeResolution.indexOf(
    'resolvedPathname.startsWith("/hr")) return "hr"',
  );
  assert.ok(payrollIndex >= 0, "expected payroll route module resolution");
  assert.ok(hrIndex >= 0, "expected HR route module resolution");
  assert.ok(
    payrollIndex < hrIndex,
    "expected payroll route to resolve before broad /hr",
  );

  for (const expected of [
    'claims.user_role === "branch_manager"',
    "claims.branch_id == null",
    '.eq("id", claims.branch_id)',
    "canManageEmployees",
    "? fetchEmployees()",
  ]) {
    assert.ok(
      hrPage.includes(expected),
      `expected HR page to include ${expected}`,
    );
  }

  for (const expected of [
    "canManageEmployees: boolean",
    'const defaultTab = canManageEmployees ? "employees" : "assignments"',
    "{canManageEmployees ? (",
    '<TabsTrigger value="employees">',
  ]) {
    assert.ok(
      hrClient.includes(expected),
      `expected HR client to include ${expected}`,
    );
  }

  assert.ok(
    employeeHome.includes('moduleKey: "hr"') &&
      employeeHome.includes('href: () => "/hr"'),
    "expected Branch Manager Employee home to link to /hr",
  );
});
