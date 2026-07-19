import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OWNER_NAV_GROUPS,
  canAccess,
  MODULE_ACL,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";

import {
  resolveOwnerPrimaryTabs,
  resolveOwnerDeepNav,
} from "../app/lib/owner-nav";
import {
  findActivePrimaryNavItem,
  type ShellNavGroup,
  type ShellNavItem,
} from "../app/lib/shell-primitives";
import {
  OWNER_MODULE_IDS,
  FLAT_OWNER_MODULE_IDS,
} from "../app/lib/owner-module-contract";

// Regression floor for the Owner surface navigation resolvers. Expectations
// are driven from MODULE_ACL membership so the Owner sidebar stays single-sourced.

const OWNER_TAB_MODULES: ModuleKey[] = OWNER_NAV_GROUPS.flatMap(
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
  return OWNER_TAB_MODULES.filter((key) => canAccess(role, key)).map(
    (key) => MODULE_ACL[key].path,
  );
}

test("owner sidebar tabs include the Owner surface and all tenant modules", () => {
  const items = resolveOwnerPrimaryTabs("owner", BRANCH_ID);
  const hrefs = hrefSet(items);

  for (const key of OWNER_TAB_MODULES) {
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
  const items = resolveOwnerPrimaryTabs("owner");
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
    assert.deepEqual(resolveOwnerPrimaryTabs(role), []);
  });
}

test("primary tab hrefs and labels are deduplicated", () => {
  for (const role of ["owner", ...RESTRICTED_ROLES] as StaffRole[]) {
    const items = resolveOwnerPrimaryTabs(role, BRANCH_ID);
    assertUniqueTabs(items, `${role} primary tabs`);
  }
});

test("deep-nav hrefs and labels are deduplicated", () => {
  for (const adminModule of OWNER_MODULE_IDS) {
    assertUniqueTabs(
      flattenGroups(resolveOwnerDeepNav("owner", adminModule)),
      `${adminModule} sub-tabs`,
    );
  }
});

test("findActivePrimaryNavItem matches the primary tab for the current path", () => {
  const items = resolveOwnerPrimaryTabs("owner", BRANCH_ID);
  const active = findActivePrimaryNavItem(items, "/settings/payments");
  assert.ok(active, "an active sidebar tab must be found for settings");
  assert.equal(active?.href, MODULE_ACL.settings.path);
});

test("findActivePrimaryNavItem returns undefined for an unmatched path", () => {
  const items = resolveOwnerPrimaryTabs("owner", BRANCH_ID);
  assert.equal(
    findActivePrimaryNavItem(items, "/totally/unknown/path"),
    undefined,
  );
});

test("resolveOwnerDeepNav returns settings sub-pages", () => {
  const groups = resolveOwnerDeepNav("owner", "settings");
  assert.ok(Array.isArray(groups));
  const hrefs = hrefList(flattenGroups(groups));
  assert.deepEqual(hrefs, [
    "/settings/general",
    "/settings/payments",
    "/settings/printers",
  ]);
});

for (const surface of FLAT_OWNER_MODULE_IDS) {
  test(`resolveOwnerDeepNav returns no deep-nav group for the flat ${surface} module`, () => {
    // menu/orders/branches are flat single-page modules: their own primary
    // tab already links to the module, so no group duplicating that same
    // leaf under itself is emitted (W2, D063).
    const groups = resolveOwnerDeepNav("owner", surface);
    assert.deepEqual(
      groups,
      [],
      `${surface} deep nav must not wrap its own primary tab in a group`,
    );
  });
}

test("resolveOwnerDeepNav surfaces People + account groups for Owner HR", () => {
  // Owner sees both the People landing group and the owner-only account
  // administration group (staff roster + audit) folded under /hr (D048).
  const ownerGroups = resolveOwnerDeepNav("owner", "hr");
  const ownerHrefs = hrefList(flattenGroups(ownerGroups));
  assert.ok(
    ownerHrefs.includes(MODULE_ACL.hr.path),
    "HR deep nav must include the People landing",
  );
  assert.ok(
    ownerHrefs.includes(MODULE_ACL.staff.path),
    "owner HR deep nav must include the staff roster",
  );
  assert.ok(
    ownerHrefs.includes(`${MODULE_ACL.staff.path}/audit`),
    "owner HR deep nav must include the permission audit",
  );

  assert.deepEqual(
    resolveOwnerDeepNav("branch_manager", "hr"),
    [],
    "branch_manager must not receive Owner surface deep navigation",
  );
});
