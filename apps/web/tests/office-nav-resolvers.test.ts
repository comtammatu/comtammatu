import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAccess,
  MODULE_ACL,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";

import {
  resolveOfficePrimaryTabs,
  resolveOfficeDeepNav,
  resolveBranchDeepNav,
} from "../app/lib/office-nav";
import {
  findActivePrimaryNavItem,
  type ShellNavGroup,
  type ShellNavItem,
} from "../app/lib/shell-primitives";

// Regression floor for the office navigation resolvers. Expectations are driven
// from MODULE_ACL membership so the primary sidebar tabs stay single-sourced.

// Candidate modules the office sidebar can surface, in composition order:
// one admin tab + cross-workspace modules + branch-management modules.
const ADMIN_TAB_MODULE: ModuleKey = "dashboard";
const WORKSPACE_TAB_MODULES: ModuleKey[] = [
  "menu",
  "orders",
  "inventory",
  "finance",
  "hr",
];

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
  return [ADMIN_TAB_MODULE, ...WORKSPACE_TAB_MODULES]
    .filter((key) => canAccess(role, key))
    .map((key) => MODULE_ACL[key].path);
}

test("owner sidebar tabs include admin + all workspaces + branch management", () => {
  const items = resolveOfficePrimaryTabs("owner", BRANCH_ID);
  const hrefs = hrefSet(items);

  for (const key of [ADMIN_TAB_MODULE, ...WORKSPACE_TAB_MODULES]) {
    assert.equal(
      hrefs.has(MODULE_ACL[key].path),
      true,
      `owner sidebar tabs must include ${key} (${MODULE_ACL[key].path})`,
    );
  }

  for (const key of ["reports", "staff", "settings"] as ModuleKey[]) {
    assert.equal(
      hrefs.has(MODULE_ACL[key].path),
      false,
      `${key} must stay inside the admin sub-nav, not the primary tabs`,
    );
  }

  const branchTabs = items.filter((item) =>
    item.href.startsWith(`/br/${BRANCH_ID}`),
  );
  assert.equal(branchTabs.length, 1, "branch management must be one tab");
  assert.equal(branchTabs[0]?.label, "Quản lý chi nhánh");
});

test("owner sidebar tabs omit branch-management entries without a branchId", () => {
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
    for (const key of [ADMIN_TAB_MODULE, ...WORKSPACE_TAB_MODULES]) {
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
  assertUniqueTabs(
    flattenGroups(resolveOfficeDeepNav("owner", "admin")),
    "admin sub-tabs",
  );
  assertUniqueTabs(
    flattenGroups(resolveOfficeDeepNav("owner", "hr")),
    "hr sub-tabs",
  );
  assertUniqueTabs(
    flattenGroups(resolveOfficeDeepNav("owner", "menu")),
    "menu sub-tabs",
  );
  assertUniqueTabs(
    flattenGroups(resolveOfficeDeepNav("owner", "orders")),
    "orders sub-tabs",
  );
  assertUniqueTabs(
    flattenGroups(resolveBranchDeepNav("owner", BRANCH_ID)),
    "branch-management sub-tabs",
  );
});

test("findActivePrimaryNavItem matches the primary tab for the current path", () => {
  const items = resolveOfficePrimaryTabs("owner", BRANCH_ID);
  const reportsHref = MODULE_ACL.reports.path;
  const active = findActivePrimaryNavItem(items, reportsHref);
  assert.ok(active, "an active sidebar tab must be found for the reports path");
  assert.equal(active?.href, MODULE_ACL.dashboard.path);
});

test("findActivePrimaryNavItem returns undefined for an unmatched path", () => {
  const items = resolveOfficePrimaryTabs("owner", BRANCH_ID);
  assert.equal(
    findActivePrimaryNavItem(items, "/totally/unknown/path"),
    undefined,
  );
});

test("resolveOfficeDeepNav returns admin command groups for the admin surface", () => {
  const groups = resolveOfficeDeepNav("owner", "admin");
  assert.ok(Array.isArray(groups));
  assert.ok(groups.length > 0, "admin deep nav must expose command groups");
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  assert.ok(totalItems > 0, "admin deep nav groups must contain items");
});

for (const surface of ["hr", "menu", "orders"] as const) {
  test(`resolveOfficeDeepNav returns a single non-empty landing group for ${surface}`, () => {
    const groups = resolveOfficeDeepNav("owner", surface);
    assert.equal(
      groups.length,
      1,
      `${surface} deep nav must be a single landing group`,
    );
    assert.ok(
      (groups[0]?.items.length ?? 0) > 0,
      `${surface} landing group must be non-empty`,
    );
  });
}

test("resolveBranchDeepNav returns the branch group when branchId + role allow", () => {
  const groups = resolveBranchDeepNav("owner", BRANCH_ID);
  assert.ok(groups.length > 0, "owner with a branchId must get a branch group");
  const everyHrefIsBranchScoped = groups.every((group) =>
    group.items.every((item) => item.href.startsWith(`/br/${BRANCH_ID}`)),
  );
  assert.equal(
    everyHrefIsBranchScoped,
    true,
    "branch deep nav hrefs must be scoped to the active branch",
  );
});

test("resolveBranchDeepNav returns [] without a branchId", () => {
  assert.deepEqual(resolveBranchDeepNav("owner", null), []);
  assert.deepEqual(resolveBranchDeepNav("owner"), []);
});

test("resolveBranchDeepNav returns [] for a role with no branch access", () => {
  // warehouse_manager has no branch_dashboard / branch_settings access.
  assert.deepEqual(resolveBranchDeepNav("warehouse_manager", BRANCH_ID), []);
});
