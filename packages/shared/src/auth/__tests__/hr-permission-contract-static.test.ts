import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE_ACL } from "../module-acl";
import type { StaffRole } from "../types";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const extractTemplateConst = (source: string, name: string) => {
  const match = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`).exec(source);
  assert.ok(match, `expected ${name} template const`);
  const value = match[1];
  assert.ok(value, `expected ${name} template body`);
  return value;
};

test("HR route ACL is a candidate gate and live capabilities decide access", () => {
  for (const moduleKey of ["staff", "hr", "hr_payroll"] as const) {
    assert.deepEqual(MODULE_ACL[moduleKey].allowedRoles, [
      "owner",
      "self_service",
      "accountant",
      "central_supply_ops",
      "central_kitchen_lead",
      "branch_manager",
      "cashier",
      "chef",
      "branch_staff",
    ] satisfies readonly StaffRole[]);
  }

  const proxy = read("apps/web/proxy.ts");
  const layout = read("apps/web/app/(protected)/layout.tsx");
  assert.match(proxy, /PERMISSION_KEYS\.HR_VIEW_EMPLOYEE/);
  assert.match(proxy, /PERMISSION_KEYS\.HR_PAYROLL_PREPARE/);
  assert.match(proxy, /PERMISSION_KEYS\.AUTH_BINDING_READ/);
  assert.match(proxy, /"has_permission"/);
  assert.match(
    proxy,
    /pathname === "\/"[\s\S]*user_role !== "self_service"[\s\S]*HR_VIEW_EMPLOYEE/,
  );
  assert.doesNotMatch(
    proxy.slice(
      proxy.indexOf('if (pathname === "/hr"'),
      proxy.indexOf("// Owner-plane routes"),
    ),
    /has_permission_any/,
  );
  assert.match(layout, /PERMISSION_KEYS\.HR_VIEW_EMPLOYEE/);
  assert.match(layout, /PERMISSION_KEYS\.HR_PAYROLL_PREPARE/);
});

test("HR Server Action gates match the route contract", () => {
  const hrActions = read("apps/web/app/(protected)/hr/actions.ts");
  const staffActions = read("apps/web/app/(protected)/hr/staff/actions.ts");
  const permissionActions = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/actions.ts",
  );
  const permissionPage = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/page.tsx",
  );
  const positionTasksActions = read(
    "apps/web/app/(protected)/hr/position-tasks-actions.ts",
  );
  const leaveActions = read(
    "apps/web/app/(protected)/hr/leave-request-actions.ts",
  );
  const payrollActions = read("apps/web/app/(protected)/hr/payroll-actions.ts");
  assert.match(staffActions, /PERMISSION_KEYS\.STAFF_PROVISION/);
  assert.match(staffActions, /PERMISSION_KEYS\.STAFF_ASSIGN_POSITION/);
  assert.match(staffActions, /PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE/);
  assert.match(permissionActions, /PERMISSION_KEYS\.AUTH_BINDING_MANAGE/);
  assert.match(permissionActions, /"set_auth_role_binding"/);
  assert.match(permissionPage, /PERMISSION_KEYS\.AUTH_BINDING_READ/);

  assert.match(
    hrActions,
    /const HR_ROLES: readonly StaffRole\[\] = STAFF_ROLES/,
  );
  assert.match(hrActions, /PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE/);
  assert.match(hrActions, /PERMISSION_KEYS\.HR_MANAGE_SHIFT_CATALOG/);
  assert.match(hrActions, /PERMISSION_KEYS\.HR_FORCE_CLOSE_ATTENDANCE/);
  assert.match(hrActions, /"force_close_stale_attendance"/);

  assert.match(
    positionTasksActions,
    /PERMISSION_KEYS\.HR_MANAGE_POSITION_TASKS/,
  );
  assert.match(positionTasksActions, /save_employee_shift_task_override/);
  assert.match(positionTasksActions, /clear_employee_shift_task_override/);

  assert.match(leaveActions, /permissionBranchId: \(data\) => data\.branchId/);
  assert.match(leaveActions, /requireBranchScope: true/);
  assert.doesNotMatch(leaveActions, /createServiceClient/);

  assert.match(payrollActions, /PERMISSION_KEYS\.HR_PAYROLL_PREPARE/);
  assert.match(payrollActions, /PERMISSION_KEYS\.HR_PAYROLL_SNAPSHOT/);
  assert.match(payrollActions, /"snapshot_payroll_calculation"/);
  assert.doesNotMatch(
    payrollActions,
    /FINANCE_PAYROLL_APPROVE/,
    "Finance owns payment approval and evidence; HR payroll actions must not mark payment",
  );
});

test("HR routes keep employee, attendance and setup surfaces separate", () => {
  const hrPage = read("apps/web/app/(protected)/hr/page.tsx");
  const hrClient = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const attendancePage = read(
    "apps/web/app/(protected)/hr/attendance/page.tsx",
  );
  const setupPage = read("apps/web/app/(protected)/hr/setup/page.tsx");

  assert.match(hrPage, /from\("positions"\)/);
  assert.match(hrClient, /<EmployeeTable[\s\S]*canManage/);
  assert.doesNotMatch(
    hrClient,
    /AttendanceTable|ShiftsTable|PositionTasksClient/,
    "the employee landing must not preload unrelated HR data",
  );
  assert.match(attendancePage, /<AttendanceTable[\s\S]*?branches=\{branches\}/);
  assert.match(
    attendancePage,
    /<LeaveRequestsTable[\s\S]*branches=\{storeBranches\}[\s\S]*branchScope=\{branchScope\}[\s\S]*\/>/,
  );
  assert.match(attendancePage, /<RosterWeekClient/);
  assert.match(
    setupPage,
    /<HrSetupClient[\s\S]*initialShifts=\{shifts\}[\s\S]*positionTasksData=\{positionTasksData\}/,
  );
});

test("HR employee salary and contract controls stay capability-gated", () => {
  const employeeTable = read("apps/web/app/(protected)/hr/employee-table.tsx");
  const employeeFormDialog = read(
    "apps/web/app/(protected)/hr/employee-form-dialog.tsx",
  );

  assert.match(
    employeeTable,
    /\.\.\.\(canManage\s*\?\s*\[[\s\S]*?key: "salary"[\s\S]*?render: renderSalary[\s\S]*?key: "contractType"[\s\S]*?render: renderContractType[\s\S]*?\]\s*:\s*\[\]\)/,
  );
  assert.match(
    employeeTable,
    /\{canManage \? \(\s*<Badge[\s\S]*?renderContractType\(employee\)[\s\S]*?\) : null\}/,
  );
  assert.match(
    employeeTable,
    /\{canManage \? \(\s*<ItemDescription[\s\S]*?renderSalary\(employee\)[\s\S]*?\) : null\}/,
  );
  assert.match(employeeTable, /formatVND/);
  assert.doesNotMatch(employeeTable, /insurance_base_salary|Lương \/ HĐ/);
  assert.match(
    employeeTable,
    /\{canManage \? renderEdit\(employee, true\) : null\}/,
  );
  assert.match(
    employeeTable,
    /\{canManage \? \(\s*<EmployeeFormDialog[\s\S]*?mode="edit"/,
  );
  assert.match(employeeFormDialog, /base_salary: baseSalaryField/);
  assert.match(
    employeeFormDialog,
    /contract_number: z\.string\(\)\.trim\(\)\.optional\(\)/,
  );
  assert.match(
    employeeFormDialog,
    /contract_signed_date: z\.string\(\)\.optional\(\)/,
  );
  assert.match(
    employeeFormDialog,
    /contract_end_date: z\.string\(\)\.optional\(\)/,
  );
});

test("HR branch-manager employee payload stays branch-safe", () => {
  const hrActions = read("apps/web/app/(protected)/hr/actions.ts");
  const ownerSelect = extractTemplateConst(hrActions, "EMPLOYEE_SELECT_OWNER");
  const branchManagerSelect = extractTemplateConst(
    hrActions,
    "EMPLOYEE_SELECT_BRANCH_MANAGER",
  );

  for (const field of [
    "base_salary",
    "insurance_base_salary",
    "id_number",
    "bank_account",
    "bank_name",
    "start_date",
    "contract_type",
    "dependents_count",
    "default_checklist_template_id",
    "phone",
    "employment_contracts",
    "contract_number",
    "gross_salary",
  ]) {
    assert.match(ownerSelect, new RegExp(`\\b${field}\\b`));
    assert.doesNotMatch(branchManagerSelect, new RegExp(`\\b${field}\\b`));
  }
  assert.match(
    hrActions,
    /isBranchManager \? EMPLOYEE_SELECT_BRANCH_MANAGER : EMPLOYEE_SELECT_OWNER/,
  );
});

test("Company HR excludes Owner from lifecycle list and mutations", () => {
  const hrActions = read("apps/web/app/(protected)/hr/actions.ts");
  const staffActions = read("apps/web/app/(protected)/hr/staff/actions.ts");
  const staffLoader = read(
    "apps/web/app/(protected)/hr/staff/load-staff-accounts.ts",
  );
  const authTypes = read("packages/shared/src/auth/types.ts");
  const permissionsPage = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/page.tsx",
  );

  assert.match(authTypes, /export function isOwnerPositionCode/);
  assert.match(
    hrActions,
    /isOwnerPositionCode\(row\.profiles\?\.positions\?\.code\)/,
  );
  assert.match(hrActions, /isOwnerPositionCode\(currentPositionCode\)/);
  assert.match(hrActions, /isOwnerPositionCode\(data\.positionCode\)/);
  assert.match(staffActions, /isOwnerPositionCode\(position_code\)/);
  assert.match(staffActions, /isOwnerPositionCode\(targetPosition\?\.code\)/);
  assert.match(staffLoader, /isOwnerPositionCode\(member\.position_code\)/);
  assert.match(permissionsPage, /isOwnerPositionCode\(position\?\.code\)/);
  assert.match(permissionsPage, /notFound\(\)/);
});

test("Owner HR administration and branch approval authority fail closed below the application ACL", () => {
  const migration = read(
    "supabase/migration-archive/20260718174604_canonical_auth_role_position_cleanup.sql",
  );
  const localSeed = read("apps/web/tests/fixtures/supabase-e2e/tenant.sql");
  const ownerOnlyKeys = [
    "hr:manage_employee",
    "staff:manage",
    "staff:assign_position",
    "staff:assign_permission",
  ];
  const branchApprovalKeys = [
    "hr:approve_leave_request",
    "hr:approve_checkout",
  ];

  assert.match(migration, /WHERE rt\.position_code IS DISTINCT FROM 'owner'/);
  assert.match(migration, /DELETE FROM public\.staff_permissions/);
  assert.match(migration, /po\.code = 'branch_manager'/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.has_permission\(/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.has_permission_any\(/,
  );
  assert.match(migration, /is_delegable_to_staff/);
  assert.match(migration, /pk\.is_delegable_to_staff = true/);
  for (const key of branchApprovalKeys) {
    assert.match(migration, new RegExp(`'${key}'`), key);
  }

  const branchManagerTemplate =
    /\('branch_manager', 'branch_manager', ARRAY\[([^\]]*)\]\)/.exec(localSeed);
  assert.ok(
    branchManagerTemplate,
    "expected branch_manager local role template",
  );
  const branchManagerPermissions = branchManagerTemplate[1] ?? "";
  assert.match(branchManagerPermissions, /'hr:view_employee'/);
  for (const key of branchApprovalKeys) {
    assert.match(branchManagerPermissions, new RegExp(`'${key}'`), key);
  }
  for (const key of ownerOnlyKeys) {
    assert.doesNotMatch(branchManagerPermissions, new RegExp(`'${key}'`), key);
  }
});

test("retired employee route has no standalone module ACL key", () => {
  const moduleAcl = read("packages/shared/src/auth/module-acl.ts");
  const routeResolution = read("packages/shared/src/auth/route-resolution.ts");
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const routeMap = read("packages/shared/src/auth/route-map.ts");
  const proxy = read("apps/web/proxy.ts");

  assert.doesNotMatch(moduleAcl, /\|\s*"employee"(?!_)/);
  assert.doesNotMatch(moduleAcl, /\nemployee:\s*\{/);
  assert.doesNotMatch(navConfig, /moduleKey:\s*"employee"/);
  assert.doesNotMatch(routeMap, /MODULE_ACL\.employee(?!_)/);
  assert.doesNotMatch(proxy, /moduleKey === "employee"/);
  assert.ok(
    routeResolution.includes(
      'if (/^\\/br\\/\\d+\\/shift(?:\\/|$)/.test(pathname)) return "branch_home";',
    ),
  );
  assert.ok(
    routeResolution.includes(
      'if (/^\\/br\\/\\d+\\/profile(?:\\/|$)/.test(pathname)) return "branch_home";',
    ),
  );
});

test("HR imports the shared staff runtime, not the retired employee runtime", () => {
  const hrFiles = [
    "apps/web/app/(protected)/hr/actions.ts",
    "apps/web/lib/hr/payroll-day-math.ts",
    "apps/web/lib/hr/leave-request-data.ts",
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/branch-leave-approvals-client.tsx",
  ];

  assert.equal(existsSync(resolve(repoRoot, "apps/web/lib/employee")), false);
  assert.match(
    read("apps/web/lib/staff-runtime/_lib/workday-math.ts"),
    /export function countCompletedShiftWorkdays/,
  );

  for (const path of hrFiles) {
    assert.doesNotMatch(read(path), /@lib\/employee\b/, path);
  }

  assert.match(
    read("apps/web/app/(protected)/hr/actions.ts"),
    /@lib\/staff-runtime\/_lib\/workday-math/,
  );
  assert.match(
    read("apps/web/lib/hr/payroll-day-math.ts"),
    /@lib\/staff-runtime\/_lib\/workday-math/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/branch-leave-approvals-client.tsx",
    ),
    /@lib\/branch-operator\/components\/branch-operator-page/,
  );
});

test("HR personnel admin RLS keeps HR grants off base-table policies", () => {
  const personnelRls = read(
    "supabase/migration-archive/20260708090000_hr_owner_only_personnel_rls.sql",
  );

  assert.doesNotMatch(personnelRls, /CREATE OR REPLACE FUNCTION public\./);
  assert.match(
    personnelRls,
    /DROP FUNCTION IF EXISTS public\.auth_is_current_owner\(\)/,
  );
  for (const policy of [
    "employees_select",
    "employees_write",
    "contracts_select",
    "contracts_write",
  ]) {
    assert.match(
      personnelRls,
      new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.`),
    );
    assert.match(
      personnelRls,
      new RegExp(
        `CREATE POLICY ${policy} ON public\\.[\\s\\S]*?po\\.code = 'owner'`,
      ),
    );
  }
  const policyBlocks =
    personnelRls.match(
      /CREATE POLICY (employees|contracts)_(select|write) ON public\.[\s\S]*?;\n/g,
    ) ?? [];
  assert.equal(policyBlocks.length, 4);
  for (const block of policyBlocks) {
    assert.doesNotMatch(block, /hr:(view|manage)_employee/);
  }
  assert.doesNotMatch(
    personnelRls,
    /DROP POLICY IF EXISTS employees_select_self/,
  );
});

test("auth docs define the HR permission contract layers", () => {
  const authDoc = read("docs/modules/auth.md");
  const routeMatrix = read("docs/spec/role-route-matrix.md");

  for (const expected of [
    "## HR Permission Contract",
    "Staff lifecycle",
    "Role binding",
    "Employee / salary / HĐLĐ",
    "Shift / task setup",
    "Payroll",
    "Branch people / shifts",
    "is excluded from HR list/create/update/deactivate",
  ]) {
    assert.ok(
      authDoc.includes(expected) || routeMatrix.includes(expected),
      `expected docs to contain ${expected}`,
    );
  }
});

test("scoped role bindings require security_admin plus AAL2", () => {
  const migration = read(
    "supabase/migration-archive/20260801181125_hr_scoped_role_bindings.sql",
  );

  assert.match(migration, /WHERE key <> 'auth:binding_manage'/);
  assert.match(migration, /\('security_admin', 'auth:binding_manage'\)/);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'/);
  assert.match(migration, /'aal2_required'/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.grant_permission[\s\S]*FROM authenticated/,
  );
  assert.match(
    migration,
    /public\.has_permission\(profile\.branch_id, 'hr:view_employee'\)/,
  );
});

test("payroll finalization is transactional and idempotent", () => {
  const migration = read(
    "supabase/migration-archive/20260801181125_hr_scoped_role_bindings.sql",
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /'status', 'already_finalized'/);
  assert.match(
    migration,
    /public\.has_permission\(NULL, 'hr:payroll_snapshot'\)/,
  );
});

test("employee shift-task overrides are full replacements materialized at check-in", () => {
  const migration = read(
    "supabase/migration-archive/20260801181126_employee_shift_task_overrides.sql",
  );
  const client = read("apps/web/app/(protected)/hr/position-tasks-client.tsx");

  assert.match(migration, /employee_id IS NULL OR branch_id IS NULL/);
  assert.match(migration, /shift_checklist_templates_one_active_employee/);
  assert.match(migration, /DELETE FROM public\.shift_checklist_template_items/);
  assert.match(migration, /materialize_employee_shift_task_override/);
  assert.match(migration, /suppress_position_tasks_for_employee_override/);
  assert.match(migration, /template_item_id/);
  assert.match(client, /<DataTable/);
  assert.match(client, /<FormDialog/);
  assert.match(client, /<AppDialog/);
  assert.doesNotMatch(client, /SelectTrigger[\s\S]*template/i);
});
