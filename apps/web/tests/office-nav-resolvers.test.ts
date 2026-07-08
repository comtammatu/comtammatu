import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAccess,
  DOMAIN_WORKSPACE_ITEMS,
  MODULE_ACL,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";

import {
  resolveOfficePrimaryTabs,
  resolveOfficeDeepNav,
} from "../app/lib/office-nav";
import {
  findActivePrimaryNavItem,
  type ShellNavGroup,
  type ShellNavItem,
} from "../app/lib/shell-primitives";
import {
  FLAT_OFFICE_MODULE_IDS,
  OFFICE_MODULE_IDS,
} from "../app/lib/office-module-contract";

// Regression floor for the office navigation resolvers. Expectations are driven
// from MODULE_ACL membership so the primary sidebar tabs stay single-sourced.

// Candidate modules the office sidebar can surface, in composition order:
// one settings tab + cross-workspace modules. Branch-scoped routes live in Branch Hub.
const SETTINGS_TAB_MODULE: ModuleKey = "settings";
const WORKSPACE_TAB_MODULES: ModuleKey[] = DOMAIN_WORKSPACE_ITEMS.map(
  (item) => item.moduleKey,
);

const RESTRICTED_ROLES: StaffRole[] = [
  "cashier",
  "warehouse_manager",
  "production_manager",
  "branch_manager",
];

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

// Expected hrefs for the non-branch (admin + workspace) primary tabs.
function expectedTenantHrefs(role: StaffRole): string[] {
  return [SETTINGS_TAB_MODULE, ...WORKSPACE_TAB_MODULES]
    .filter((key) => canAccess(role, key))
    .map((key) => MODULE_ACL[key].path);
}

test("owner sidebar tabs include settings + all tenant workspaces", () => {
  const items = resolveOfficePrimaryTabs("owner", BRANCH_ID);
  const hrefs = hrefSet(items);

  for (const key of [SETTINGS_TAB_MODULE, ...WORKSPACE_TAB_MODULES]) {
    assert.equal(
      hrefs.has(MODULE_ACL[key].path),
      true,
      `owner sidebar tabs must include ${key} (${MODULE_ACL[key].path})`,
    );
  }

  assert.equal(
    hrefs.has("/admin/dashboard"),
    false,
    "admin dashboard must not surface as an office primary tab",
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
    "branch-scoped tabs must stay in Branch Hub, not office sidebar",
  );
});

test("owner sidebar tabs omit branch-scoped entries without a branchId", () => {
  const items = resolveOfficePrimaryTabs("owner");
  const branchHrefs = items.filter((item) => item.href.startsWith("/br/"));
  assert.deepEqual(branchHrefs, []);

  // The tenant-level admin + workspace entries remain.
  const hrefs = hrefSet(items);
  for (const href of expectedTenantHrefs("owner")) {
    assert.equal(hrefs.has(href), true, `owner sidebar tabs must keep ${href}`);
  }
});

for (const role of RESTRICTED_ROLES) {
  test(`${role} sidebar tabs expose only MODULE_ACL-allowed tenant entries`, () => {
    const items = resolveOfficePrimaryTabs(role);
    const hrefs = hrefList(items).filter((href) => !href.startsWith("/br/"));

    const expected = expectedTenantHrefs(role);
    assert.deepEqual(
      [...hrefs].sort(),
      [...expected].sort(),
      `${role} sidebar tab tenant entries must equal its ACL-allowed subset`,
    );

    // A restricted role must never see an admin-only module it cannot access.
    for (const key of [SETTINGS_TAB_MODULE, ...WORKSPACE_TAB_MODULES]) {
      if (!canAccess(role, key)) {
        assert.equal(
          hrefs.includes(MODULE_ACL[key].path),
          false,
          `${role} must not see ${key}`,
        );
      }
    }
  });
}

test("primary tab hrefs and labels are deduplicated", () => {
  for (const role of ["owner", ...RESTRICTED_ROLES] as StaffRole[]) {
    const items = resolveOfficePrimaryTabs(role, BRANCH_ID);
    assertUniqueTabs(items, `${role} primary tabs`);
  }
});

test("deep-nav hrefs and labels are deduplicated", () => {
  for (const officeModule of OFFICE_MODULE_IDS) {
    assertUniqueTabs(
      flattenGroups(resolveOfficeDeepNav("owner", officeModule)),
      `${officeModule} sub-tabs`,
    );
  }
});

test("findActivePrimaryNavItem matches the primary tab for the current path", () => {
  const items = resolveOfficePrimaryTabs("owner", BRANCH_ID);
  const active = findActivePrimaryNavItem(items, "/admin/settings/payments");
  assert.ok(active, "an active sidebar tab must be found for settings");
  assert.equal(active?.href, MODULE_ACL.settings.path);
});

test("findActivePrimaryNavItem returns undefined for an unmatched path", () => {
  const items = resolveOfficePrimaryTabs("owner", BRANCH_ID);
  assert.equal(
    findActivePrimaryNavItem(items, "/totally/unknown/path"),
    undefined,
  );
});

test("resolveOfficeDeepNav returns settings sub-pages for the admin surface", () => {
  const groups = resolveOfficeDeepNav("owner", "admin");
  assert.ok(Array.isArray(groups));
  const hrefs = hrefList(flattenGroups(groups));
  assert.deepEqual(hrefs, [
    "/admin/settings/general",
    "/admin/settings/payments",
    "/admin/settings/printers",
  ]);
});

for (const surface of FLAT_OFFICE_MODULE_IDS) {
  test(`resolveOfficeDeepNav returns no deep-nav group for the flat ${surface} module`, () => {
    // menu/orders/branches are flat single-page modules: their own primary
    // tab already links to the module, so no group duplicating that same
    // leaf under itself is emitted (W2, D063).
    const groups = resolveOfficeDeepNav("owner", surface);
    assert.deepEqual(
      groups,
      [],
      `${surface} deep nav must not wrap its own primary tab in a group`,
    );
  });
}

test("resolveOfficeDeepNav surfaces People + gated account groups for HR", () => {
  // Owner sees both the People landing group and the owner-only account
  // administration group (staff roster + audit) folded under /hr (D048).
  const ownerGroups = resolveOfficeDeepNav("owner", "hr");
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

  // branch_manager reaches HR but not the staff-only account surface.
  const managerGroups = resolveOfficeDeepNav("branch_manager", "hr");
  const managerHrefs = hrefList(flattenGroups(managerGroups));
  assert.ok(
    managerHrefs.includes(MODULE_ACL.hr.path),
    "branch_manager HR deep nav must include the People landing",
  );
  assert.equal(
    managerHrefs.includes(MODULE_ACL.staff.path),
    false,
    "branch_manager must not see the owner-only staff roster",
  );
});
