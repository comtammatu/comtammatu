import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getStaffPermissionLabelVi } from "../lib/messages/owner";

function source(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}

test("HR account access keeps the approved list and permission hierarchy", () => {
  const page = source("app/(protected)/hr/staff/page.tsx");
  const filters = source("app/(protected)/hr/staff/staff-filters.tsx");
  const table = source("app/(protected)/hr/staff/staff-table.tsx");
  const form = source("app/(protected)/hr/staff/staff-form-dialog.tsx");
  const actions = source("app/(protected)/hr/staff/actions.ts");
  const permissions = source(
    "app/(protected)/hr/staff/[id]/permissions/permissions-client.tsx",
  );
  const permissionsPage = source(
    "app/(protected)/hr/staff/[id]/permissions/page.tsx",
  );
  const ownerMessages = source("lib/messages/owner.ts");

  assert.match(page, /q\?: string/);
  assert.match(page, /matchesSearch/);
  assert.match(page, /<AppListFrame/);
  assert.match(filters, /<AppToolbar/);
  assert.match(filters, /variant="inline"/);
  assert.match(filters, /size=\{controlSize\}/);
  assert.match(filters, /router\.replace/);
  assert.match(table, /permissions\?tab=permissions/);
  assert.match(form, /copy\.accountSection/);
  assert.match(
    form,
    /router\.push\(`\/hr\/staff\/\$\{staffId\}\/permissions\?tab=permissions`\)/,
  );
  assert.match(actions, /data:\s*\{ staffId: data\.user\?\.id \?\? null \}/);

  const templateIndex = permissions.indexOf("title={copy.templateTitle}");
  const currentIndex = permissions.indexOf("title={copy.currentTitle}");
  const exceptionIndex = permissions.indexOf("title={copy.exceptionTitle}");
  assert.ok(templateIndex >= 0, "template section must be visible");
  assert.ok(
    currentIndex > templateIndex,
    "current rights must follow templates",
  );
  assert.ok(
    exceptionIndex > currentIndex,
    "exception rights must remain secondary to current rights",
  );
  assert.match(permissions, /<DataTable/);
  assert.match(permissions, /<FormDialog<GrantExceptionValues>/);
  assert.match(permissions, /template\.positionCode === targetPositionCode/);
  assert.match(permissions, /branch_id: targetBranchId/);
  assert.match(permissions, /copy\.permissionModuleLabels\[permission\.module\]/);
  assert.match(permissions, /getStaffPermissionLabelVi/);
  assert.doesNotMatch(permissions, /template\.name/);
  assert.match(permissions, /branchNames: \{ id: number; name: string \}\[\]/);
  assert.match(permissionsPage, /branchNames=\{\(branchRows \?\? \[\]\)\.map/);
  assert.match(permissionsPage, /targetPositionCode=\{position\?\.code \?\? null\}/);
  assert.match(permissionsPage, /targetBranchId=\{profile\.branch_id\}/);
  assert.match(ownerMessages, /"inventory:request_create": "Tạo yêu cầu hàng"/);
  assert.match(ownerMessages, /inventory_procurement: "Mua hàng & nhập kho"/);
  assert.match(ownerMessages, /\/\[À-ỹĐđ\]\/u\.test\(description\)/);
  assert.match(permissionsPage, /defaultValue="permissions"/);
  assert.match(
    permissionsPage,
    /motion-safe:animate-in motion-safe:fade-in/,
  );
  assert.doesNotMatch(permissionsPage, /OverviewTab/);
  assert.doesNotMatch(permissionsPage, /value: "overview"/);
});

test("HR permission labels never fall back to technical English copy", () => {
  assert.equal(
    getStaffPermissionLabelVi(
      "inventory:request_create",
      "Create branch stock request drafts",
    ),
    "Tạo yêu cầu hàng",
  );
  assert.equal(
    getStaffPermissionLabelVi("future:unknown", "Internal permission code"),
    "Không xác định",
  );
  assert.equal(
    getStaffPermissionLabelVi("future:vietnamese", "Xem dữ liệu vận hành"),
    "Xem dữ liệu vận hành",
  );
});
