import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADMIN_DASHBOARD_ITEMS,
  MODULE_ACL,
  STAFF_ROLES,
} from "@comtammatu/shared/auth";
import {
  resolveAdminDashboardDeepNav,
  resolveAdminDashboardPrimaryTabs,
} from "../app/lib/admin-dashboard-nav";
import {
  FLAT_ADMIN_DASHBOARD_MODULE_IDS,
  ADMIN_DASHBOARD_MODULE_IDS,
} from "../app/lib/admin-dashboard-module-contract";
import {
  findActivePrimaryNavItem,
  type ShellNavGroup,
  type ShellNavItem,
} from "../app/lib/shell-primitives";

function flattenGroups(groups: ShellNavGroup[]): ShellNavItem[] {
  return groups.flatMap((group) => group.items);
}

function assertUniqueTabs(items: ShellNavItem[], label: string): void {
  const hrefs = items.map((item) => item.href);
  const labels = items.map((item) => item.label);
  assert.equal(
    hrefs.length,
    new Set(hrefs).size,
    `${label} must not contain duplicate hrefs`,
  );
  assert.equal(
    labels.length,
    new Set(labels).size,
    `${label} must not contain duplicate labels`,
  );
}

test("Owner Admin Dashboard contains every declared tenant destination", () => {
  const items = resolveAdminDashboardPrimaryTabs("owner");
  const hrefs = new Set(items.map((item) => item.href));

  for (const item of ADMIN_DASHBOARD_ITEMS) {
    assert.equal(
      hrefs.has(MODULE_ACL[item.moduleKey].path),
      true,
      `Owner must see ${item.moduleKey}`,
    );
  }

  assert.equal(hrefs.has("/admin/dashboard"), false);
  assert.equal(hrefs.has(MODULE_ACL.staff.path), false);
  assert.deepEqual(
    items.filter((item) => item.href.startsWith("/br/")),
    [],
  );
});

test("non-Owner roles receive no Admin Dashboard navigation", () => {
  for (const role of STAFF_ROLES.filter((role) => role !== "owner")) {
    assert.deepEqual(resolveAdminDashboardPrimaryTabs(role), [], role);
    for (const moduleId of ADMIN_DASHBOARD_MODULE_IDS) {
      assert.deepEqual(resolveAdminDashboardDeepNav(role, moduleId), [], role);
    }
  }
});

test("Admin Dashboard primary and deep navigation stay deduplicated", () => {
  assertUniqueTabs(
    resolveAdminDashboardPrimaryTabs("owner"),
    "Admin Dashboard primary tabs",
  );

  for (const moduleId of ADMIN_DASHBOARD_MODULE_IDS) {
    assertUniqueTabs(
      flattenGroups(resolveAdminDashboardDeepNav("owner", moduleId)),
      `${moduleId} sub-tabs`,
    );
  }
});

test("active Admin Dashboard tab follows the current module", () => {
  const items = resolveAdminDashboardPrimaryTabs("owner");
  assert.equal(
    findActivePrimaryNavItem(items, "/admin/settings/payments")?.href,
    MODULE_ACL.settings.path,
  );
  assert.equal(
    findActivePrimaryNavItem(items, "/totally/unknown/path"),
    undefined,
  );
});

test("settings deep navigation stays under Admin Dashboard", () => {
  const hrefs = flattenGroups(
    resolveAdminDashboardDeepNav("owner", "admin"),
  ).map((item) => item.href);

  assert.deepEqual(hrefs, [
    "/admin/settings/general",
    "/admin/settings/payments",
    "/admin/settings/printers",
  ]);
});

for (const moduleId of FLAT_ADMIN_DASHBOARD_MODULE_IDS) {
  test(`${moduleId} remains a flat Admin Dashboard module`, () => {
    assert.deepEqual(resolveAdminDashboardDeepNav("owner", moduleId), []);
  });
}

test("Owner HR deep navigation contains people and account administration", () => {
  const hrefs = flattenGroups(resolveAdminDashboardDeepNav("owner", "hr")).map(
    (item) => item.href,
  );

  for (const href of [
    MODULE_ACL.hr.path,
    MODULE_ACL.hr_payroll.path,
    MODULE_ACL.staff.path,
    `${MODULE_ACL.staff.path}/audit`,
  ]) {
    assert.equal(hrefs.includes(href), true, href);
  }
});
