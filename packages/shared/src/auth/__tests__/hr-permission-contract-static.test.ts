import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canAccess, MODULE_ACL } from "../module-acl";
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

test("Admin Dashboard HR route ACL is owner-only", () => {
  assert.deepEqual(MODULE_ACL.staff.allowedRoles, ["owner"]);
  assert.deepEqual(MODULE_ACL.hr_payroll.allowedRoles, ["owner"]);
  assert.deepEqual(MODULE_ACL.hr.allowedRoles, ["owner"]);

  assert.equal(canAccess("branch_manager", "hr"), false);
  assert.equal(canAccess("branch_manager", "staff"), false);
  assert.equal(canAccess("branch_manager", "hr_payroll"), false);

  for (const role of [
    "cashier",
    "chef",
  ] as const satisfies readonly StaffRole[]) {
    assert.equal(canAccess(role, "hr"), false);
    assert.equal(canAccess(role, "staff"), false);
    assert.equal(canAccess(role, "hr_payroll"), false);
  }
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
  const payrollCalculateActions = [
    "fetchPayrollPreview",
    "fetchPayrollPeriod",
    "savePayrollAdjustment",
    "removePayrollAdjustment",
    "snapshotPayrollPreview",
  ];

  assert.match(
    staffActions,
    /const MANAGER_ROLES = MODULE_ACL\.staff\.allowedRoles/,
  );
  assert.match(staffActions, /function validateStaffAssignment\(/);
  assert.match(staffActions, /function branchManagerCanAssignPosition\(/);
  assert.match(staffActions, /role === "cashier" \|\|\s*role === "chef"/);
  assert.match(staffActions, /positionCode === "guard"/);
  assert.match(staffActions, /positionCode === "cleaner"/);
  assert.match(staffActions, /positionCode === "waiter"/);
  assert.match(staffActions, /targetBranchId !== actorBranchId/);
  assert.match(
    staffActions,
    /getAuthContextWithPermissions\(\s*MANAGER_ROLES,\s*POSITION_ASSIGN_PERMISSIONS,\s*effectiveBranchId \?\? null,\s*\)/,
  );
  assert.equal(
    (
      staffActions.match(
        /const assignmentError = validateStaffAssignment\(/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(
    permissionActions,
    /const STAFF_ADMIN_ROLES = MODULE_ACL\.staff\.allowedRoles/,
  );
  assert.match(
    permissionPage,
    /const STAFF_ADMIN_ROLES = MODULE_ACL\.staff\.allowedRoles/,
  );
  assert.doesNotMatch(permissionActions, /\["owner", "branch_manager"\]/);
  assert.doesNotMatch(permissionPage, /\["owner", "branch_manager"\]/);
  assert.equal(
    (
      permissionActions.match(
        /PERMISSION_KEYS\.STAFF_ASSIGN_PERMISSION,\s*parsed\.data\.branch_id/g,
      ) ?? []
    ).length,
    3,
  );

  assert.match(
    hrActions,
    /const HR_ROLES: readonly StaffRole\[\] = \["owner"\]/,
  );
  assert.match(
    hrActions,
    /createEmployeeAccount = withAction\(\s*\{\s*roles: HR_ROLES,\s*schema: createEmployeeAccountSchema,\s*permission: PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE,\s*\}/,
  );
  assert.match(
    hrActions,
    /updateEmployee = withAction\(\s*\{\s*roles: HR_ROLES,\s*schema: updateEmployeeSchema,\s*permission: PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE,\s*\}/,
  );
  assert.match(
    positionTasksActions,
    /const POSITION_TASK_ROLES: readonly StaffRole\[\] = \["owner"\]/,
  );
  assert.match(
    hrActions,
    /fetchShifts\(\): Promise<ActionResult> \{\s*const ctx = await getAuthContext\(HR_ROLES\);/,
  );
  assert.match(
    hrActions,
    /forceCloseStaleAttendance = withAction\(\s*\{\s*roles: HR_EMPLOYEE_VIEW_ROLES,\s*schema: forceCloseStaleAttendanceSchema,\s*permission: PERMISSION_KEYS\.HR_APPROVE_CHECKOUT,\s*permissionBranchId: \(data\) => data\.branchId,\s*requireBranchScope: true,\s*\}/,
  );
  assert.match(
    hrActions,
    /fetchAttendance = withAction\(\s*\{\s*roles: SHIFT_ROLES,\s*schema: fetchAttendanceSchema,\s*permission: PERMISSION_KEYS\.HR_VIEW_EMPLOYEE,\s*permissionBranchId: \(data\) => data\.branchId,\s*requireBranchScope: true,\s*\}/,
  );
  assert.match(
    hrActions,
    /getAttendancePhotoUrl = withAction\(\s*\{\s*roles: SHIFT_ROLES,\s*schema: attendancePhotoSchema,\s*permission: PERMISSION_KEYS\.HR_VIEW_EMPLOYEE,\s*permissionBranchId: \(data\) => data\.branchId,\s*requireBranchScope: true,\s*\}/,
  );
  assert.match(
    hrActions,
    /fetchAttendanceSummary = withAction\(\s*\{\s*roles: SHIFT_ROLES,\s*schema: fetchAttendanceSummarySchema,\s*permission: PERMISSION_KEYS\.HR_VIEW_EMPLOYEE,\s*permissionBranchId: \(data\) => data\.branchId,\s*requireBranchScope: true,\s*\}/,
  );

  assert.match(leaveActions, /permissionBranchId: \(data\) => data\.branchId/);
  assert.match(leaveActions, /requireBranchScope: true/);
  assert.match(
    leaveActions,
    /fetchApprovedLeaveMonth = withAction\([\s\S]*?permissionBranchId: \(data\) => data\.branchId,[\s\S]*?requireBranchScope: true,[\s\S]*?claims\.user_role === "branch_manager" &&[\s\S]*?claims\.branch_id !== data\.branchId/,
  );
  assert.match(
    leaveActions,
    /fetchLeaveRequests = withAction\([\s\S]*?permissionBranchId: \(data\) => data\.branchId,[\s\S]*?requireBranchScope: true,[\s\S]*?claims\.user_role === "branch_manager" &&[\s\S]*?claims\.branch_id !== data\.branchId/,
  );
  assert.match(
    leaveActions,
    /approveLeaveRequest = withAction\([\s\S]*?schema: requestIdSchema,[\s\S]*?permission: PERMISSION_KEYS\.HR_APPROVE_LEAVE_REQUEST,[\s\S]*?permissionBranchId: \(data\) => data\.branchId,[\s\S]*?requireBranchScope: true/,
  );
  assert.match(
    leaveActions,
    /rejectLeaveRequest = withAction\([\s\S]*?schema: rejectSchema,[\s\S]*?permission: PERMISSION_KEYS\.HR_APPROVE_LEAVE_REQUEST,[\s\S]*?permissionBranchId: \(data\) => data\.branchId,[\s\S]*?requireBranchScope: true/,
  );
  assert.match(
    payrollActions,
    /const PAYROLL_ROLES: readonly StaffRole\[\] = \["owner"\]/,
  );
  assert.match(
    payrollActions,
    /fetchPayrollPeriods\(\): Promise<ActionResult> \{\s*const context = await getAuthContextWithPermission\(\s*PAYROLL_ROLES,\s*PERMISSION_KEYS\.FINANCE_PAYROLL_CALCULATE,/,
  );
  for (const action of payrollCalculateActions) {
    assert.match(
      payrollActions,
      new RegExp(
        `${action} = withAction\\(\\s*\\{[\\s\\S]*?roles: PAYROLL_ROLES,[\\s\\S]*?permission: PERMISSION_KEYS\\.FINANCE_PAYROLL_CALCULATE,`,
      ),
    );
  }
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

  assert.match(
    hrPage,
    /from\("positions"\)/,
  );
  assert.match(
    hrClient,
    /<EmployeeTable[\s\S]*canManage/,
  );
  assert.doesNotMatch(
    hrClient,
    /AppPageTabs|AttendanceTable|ShiftsTable|PositionTasksClient/,
    "the employee landing must not preload unrelated HR data",
  );
  assert.match(
    attendancePage,
    /<AttendanceTable branches=\{branches\} \/>[\s\S]*<LeaveRequestsTable branches=\{branches\} \/>/,
  );
  assert.match(
    setupPage,
    /<HrSetupClient[\s\S]*initialShifts=\{shifts\}[\s\S]*positionTasksData=\{positionTasksData\}/,
  );
});

test("HR employee payroll and contract controls stay owner-only", () => {
  const employeeTable = read("apps/web/app/(protected)/hr/employee-table.tsx");
  const employeeFormDialog = read(
    "apps/web/app/(protected)/hr/employee-form-dialog.tsx",
  );

  assert.match(employeeTable, /\.\.\.\(canManage\s*\?\s*\[/);
  assert.match(employeeTable, /key: "payroll"/);
  assert.match(employeeTable, /render: renderPayrollProfile/);
  assert.match(
    employeeTable,
    /\{canManage \? renderPayrollProfile\(employee\) : null\}/,
  );
  assert.match(employeeTable, /\{canManage \? renderEdit\(employee\) : null\}/);
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
      'if (/^\\/br\\/\\d+\\/shift(?:\\/|$)/.test(pathname)) return "operator_home";',
    ),
  );
  assert.ok(
    routeResolution.includes(
      'if (/^\\/br\\/\\d+\\/profile(?:\\/|$)/.test(pathname)) return "operator_home";',
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
    "Staff access create/update/deactivate",
    "Permission grant/revoke/template",
    "Employee record, salary, HĐLĐ",
    "Global shift and position-task setup",
    "Payroll",
    "Branch manager only gets branch-safe attendance/leave oversight",
  ]) {
    assert.ok(
      authDoc.includes(expected) || routeMatrix.includes(expected),
      `expected docs to contain ${expected}`,
    );
  }
});
