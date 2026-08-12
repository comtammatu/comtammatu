import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTROL_SURFACE_NAV_GROUPS,
  canAccess,
  MODULE_ACL,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";

import {
  resolveControlSurfacePrimaryTabs,
  resolveControlSurfaceCoreDeepNav,
} from "../app/lib/control-surface-nav";
import {
  findActivePrimaryNavItem,
  type ShellNavGroup,
  type ShellNavItem,
} from "../app/lib/shell-primitives";
import {
  CONTROL_SURFACE_CORE_MODULE_IDS,
  CONTROL_SURFACE_MODULE_IDS,
  FLAT_CONTROL_SURFACE_MODULE_IDS,
} from "../app/lib/control-surface-module";

// Regression floor for control_surface navigation resolvers. Expectations are
// driven from MODULE_ACL membership so the Quản trị sidebar stays single-sourced.

const CONTROL_SURFACE_TAB_MODULES: ModuleKey[] = CONTROL_SURFACE_NAV_GROUPS.flatMap(
  (group) => group.items.map((item) => item.moduleKey),
);

const RESTRICTED_ROLES: StaffRole[] = ["cashier", "branch_manager"];

const BRANCH_ID = 7;

function hrefSet(items: ShellNavItem[]): Set<string> {
  return new Set(items.map((item) => item.href));
}

function hrefList(items: ShellNavItem[]): string[] {
  return items.map((item) => item.href);
}

function labelList(items: ShellNavItem[]): string[] {
  return items.map((item) => item.label);
}

function flattenGroups(groups: ShellNavGroup[]): ShellNavItem[] {
  return groups.flatMap((group) => group.items);
}

function assertUniqueTabs(items: ShellNavItem[], label: string): void {
  const hrefs = hrefList(items);
  const labels = labelList(items);
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

function expectedOwnerHrefs(role: StaffRole): string[] {
  if (!canAccess(role, "owner")) return [];
  return CONTROL_SURFACE_TAB_MODULES.filter((key) => canAccess(role, key)).map(
    (key) => MODULE_ACL[key].path,
  );
}

test("owner sidebar tabs include the Owner surface and all tenant modules", () => {
  const items = resolveControlSurfacePrimaryTabs("owner", BRANCH_ID);
  const hrefs = hrefSet(items);

  for (const key of CONTROL_SURFACE_TAB_MODULES) {
    assert.equal(
      hrefs.has(MODULE_ACL[key].path),
      true,
      `owner sidebar tabs must include ${key} (${MODULE_ACL[key].path})`,
    );
  }

  assert.equal(
    hrefs.has(MODULE_ACL.owner.path),
    true,
    "Owner surface must be the canonical first-class primary tab",
  );

  // `staff` now lives under the HR workspace (D048) — its /hr/staff path must
  // not surface as a standalone primary tab.
  assert.equal(
    hrefs.has(MODULE_ACL.staff.path),
    false,
    "staff must stay inside the HR sub-nav, not the primary tabs",
  );

  const branchTabs = items.filter((item) => item.href.startsWith("/br/"));
  assert.deepEqual(
    branchTabs,
    [],
    "branch-scoped tabs must stay out of the Owner surface sidebar",
  );

  const branchWorkspace = items.find(
    (item) => item.href === MODULE_ACL.branches.path,
  );
  assert.equal(branchWorkspace?.label, "Chi nhánh");
  assert.notEqual(
    MODULE_ACL.branches.label,
    MODULE_ACL.owner.label,
    "tenant branch label must stay distinct from the Owner overview label",
  );
});

test("owner sidebar tabs omit branch-scoped entries without a branchId", () => {
  const items = resolveControlSurfacePrimaryTabs("owner");
  const branchHrefs = items.filter((item) => item.href.startsWith("/br/"));
  assert.deepEqual(branchHrefs, []);

  // The tenant-level Owner surface entries remain.
  const hrefs = hrefSet(items);
  for (const href of expectedOwnerHrefs("owner")) {
    assert.equal(hrefs.has(href), true, `owner sidebar tabs must keep ${href}`);
  }
});

for (const role of RESTRICTED_ROLES) {
  test(`${role} has no Owner surface sidebar tabs`, () => {
    assert.deepEqual(resolveControlSurfacePrimaryTabs(role), []);
  });
}

test("primary tab hrefs and labels are deduplicated", () => {
  for (const role of ["owner", ...RESTRICTED_ROLES] as StaffRole[]) {
    const items = resolveControlSurfacePrimaryTabs(role, BRANCH_ID);
    assertUniqueTabs(items, `${role} primary tabs`);
  }
});

test("shell module ids cover every control_surface nav moduleKey", () => {
  const shellIds = new Set<string>(CONTROL_SURFACE_MODULE_IDS);
  for (const key of CONTROL_SURFACE_TAB_MODULES) {
    assert.ok(
      shellIds.has(key),
      `${key} must be in CONTROL_SURFACE_MODULE_IDS so /${key} keeps AppShell`,
    );
  }
});

test("deep-nav hrefs and labels are deduplicated", () => {
  for (const adminModule of CONTROL_SURFACE_CORE_MODULE_IDS) {
    assertUniqueTabs(
      flattenGroups(resolveControlSurfaceCoreDeepNav("owner", adminModule)),
      `${adminModule} sub-tabs`,
    );
  }
});

test("findActivePrimaryNavItem matches the primary tab for the current path", () => {
  const items = resolveControlSurfacePrimaryTabs("owner", BRANCH_ID);
  const active = findActivePrimaryNavItem(items, "/settings/payments");
  assert.ok(active, "an active sidebar tab must be found for settings");
  assert.equal(active?.href, MODULE_ACL.settings.path);
});

test("findActivePrimaryNavItem ignores URL state on a primary tab", () => {
  const items = resolveControlSurfacePrimaryTabs("owner", BRANCH_ID).map((item) =>
    item.href === MODULE_ACL.hr.path
      ? { ...item, href: `${item.href}?branch=all` }
      : item,
  );
  const active = findActivePrimaryNavItem(items, "/hr/attendance");

  assert.equal(active?.href, "/hr?branch=all");
});

test("findActivePrimaryNavItem returns undefined for an unmatched path", () => {
  const items = resolveControlSurfacePrimaryTabs("owner", BRANCH_ID);
  assert.equal(
    findActivePrimaryNavItem(items, "/totally/unknown/path"),
    undefined,
  );
});

test("resolveControlSurfaceCoreDeepNav returns settings sub-pages", () => {
  const groups = resolveControlSurfaceCoreDeepNav("owner", "settings");
  assert.ok(Array.isArray(groups));
  const hrefs = hrefList(flattenGroups(groups));
  assert.deepEqual(hrefs, [
    "/settings/general",
    "/settings/payments",
    "/settings/printers",
  ]);
});

for (const surface of FLAT_CONTROL_SURFACE_MODULE_IDS) {
  test(`resolveControlSurfaceCoreDeepNav returns no deep-nav group for the flat ${surface} module`, () => {
    // menu/orders/branches are flat single-page modules: their own primary
    // tab already links to the module, so no group duplicating that same
    // leaf under itself is emitted.
    const groups = resolveControlSurfaceCoreDeepNav("owner", surface);
    assert.deepEqual(
      groups,
      [],
      `${surface} deep nav must not wrap its own primary tab in a group`,
    );
  });
}

test("resolveControlSurfaceCoreDeepNav exposes HR candidates for the live capability gate", () => {
  // Accounts live under `/hr?view=accounts` — not a second deep-nav group.
  const ownerGroups = resolveControlSurfaceCoreDeepNav("owner", "hr");
  const ownerHrefs = hrefList(flattenGroups(ownerGroups));
  assert.ok(
    ownerHrefs.includes(MODULE_ACL.hr.path),
    "HR deep nav must include the People landing",
  );
  assert.ok(
    ownerHrefs.includes("/hr/attendance"),
    "HR deep nav must include attendance",
  );
  assert.ok(
    ownerHrefs.includes("/hr/setup"),
    "HR deep nav must include setup",
  );
  assert.equal(
    ownerHrefs.includes(MODULE_ACL.staff.path),
    false,
    "staff list must not appear as a deep-nav item",
  );
  assert.equal(
    ownerHrefs.includes(`${MODULE_ACL.staff.path}/audit`),
    false,
    "permission audit must not appear as a deep-nav item",
  );

  assert.ok(
    hrefList(
      flattenGroups(
        resolveControlSurfaceCoreDeepNav("branch_manager", "hr"),
      ),
    ).includes(MODULE_ACL.hr.path),
    "the shell filters this candidate with the live Tenant HR capability",
  );
});
