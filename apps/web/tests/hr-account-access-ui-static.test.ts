import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getStaffPermissionLabelVi } from "../lib/messages/control-surface";

function source(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

test("HR account access keeps the approved list and permission hierarchy", () => {
  const page = source("app/(protected)/hr/staff/page.tsx");
  const hrPage = source("app/(protected)/hr/page.tsx");
  const hrClient = source("app/(protected)/hr/hr-client.tsx");
  const filters = source("app/(protected)/hr/staff/staff-filters.tsx");
  const table = source("app/(protected)/hr/staff/staff-table.tsx");
  const form = source("app/(protected)/hr/staff/staff-form-dialog.tsx");
  const actions = source("app/(protected)/hr/staff/actions.ts");
  const loader = source("app/(protected)/hr/staff/load-staff-accounts.ts");
  const grant = source(
    "app/(protected)/hr/staff/grant-employee-access-button.tsx",
  );
  const permissions = source(
    "app/(protected)/hr/staff/[id]/permissions/role-bindings-client.tsx",
  );
  const permissionsPage = source(
    "app/(protected)/hr/staff/[id]/permissions/page.tsx",
  );
  const controlSurfaceMessages = source("lib/messages/control-surface.ts");

  assert.match(page, /redirect\(`\/hr\?\$\{next\.toString\(\)\}`\)/);
  assert.match(hrPage, /loadStaffAccountsData/);
  assert.match(hrPage, /view\?: string/);
  assert.match(hrPage, /initialView === "accounts" && canManageAccounts/);
  assert.match(hrClient, /paramKey="view"/);
  assert.match(hrClient, /<AppListFrame/);
  assert.match(hrClient, /GrantEmployeeAccessButton/);
  assert.match(hrClient, /AddStaffButton/);
  assert.match(filters, /<AppToolbar/);
  assert.match(filters, /variant="inline"/);
  assert.match(filters, /size=\{controlSize\}/);
  assert.match(filters, /\/hr\?/);
  assert.match(filters, /view.*accounts/);
  assert.match(table, /\/permissions/);
  assert.match(table, /permissionStatus/);
  assert.match(table, /employeeId/);
  assert.match(table, /openProfile/);
  assert.match(table, /standaloneBadge/);
  assert.match(loader, /auth_role_bindings/);
  assert.match(loader, /from\("employees"\)/);
  assert.match(loader, /employeeId/);
  assert.match(grant, /grantForEmployee/);
  assert.match(grant, /toggleStaffActive/);
  assert.match(form, /copy\.accountSection/);
  assert.match(
    form,
    /withHrBranchScope\([\s\S]*`\/hr\/staff\/\$\{staffId\}\/permissions\?tab=permissions`,[\s\S]*branchScope/,
  );
  assert.match(actions, /data:\s*\{ staffId: data\.user\?\.id \?\? null \}/);

  assert.match(permissions, /<DataTable/);
  assert.match(permissions, /<FormDialog<FormValues>/);
  assert.match(permissions, /<AppDialog/);
  assert.match(permissions, /canManage \?/);
  assert.match(permissions, /allowedScope === "branch"/);
  assert.match(permissions, /setRoleBindingAction/);
  assert.match(permissionsPage, /PERMISSION_KEYS\.AUTH_BINDING_READ/);
  assert.match(permissionsPage, /PERMISSION_KEYS\.AUTH_BINDING_MANAGE/);
  assert.match(permissionsPage, /auth_role_bindings/);
  assert.match(permissionsPage, /auth_access_roles/);
  assert.match(permissionsPage, /\/hr\?view=accounts/);
  assert.match(controlSurfaceMessages, /"inventory:request_create": "Tạo yêu cầu hàng"/);
  assert.match(controlSurfaceMessages, /inventory_procurement: "Mua hàng & nhập kho"/);
  assert.match(controlSurfaceMessages, /\/\[À-ỹĐđ\]\/u\.test\(description\)/);
  assert.match(controlSurfaceMessages, /permissionStatus:/);
  assert.match(controlSurfaceMessages, /grantForEmployee:/);
  assert.match(controlSurfaceMessages, /createAccount: "Tạo tài khoản độc lập"/);
  assert.doesNotMatch(permissionsPage, /defaultValue="permissions"/);
});

test("HR permission labels never fall back to technical English copy", () => {
  assert.equal(
    getStaffPermissionLabelVi(
      "inventory:request_create",
      "Create branch stock request drafts",
    ),
    "Tạo yêu cầu hàng",
  );
});
