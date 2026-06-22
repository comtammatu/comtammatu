import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAccess,
  MODULE_ACL,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";

import {
  resolveOfficeRailItems,
  resolveOfficeDeepNav,
  resolveBranchDeepNav,
} from "../app/lib/office-nav";
import {
  findActiveRailItem,
  type ShellNavItem,
} from "../app/lib/shell-primitives";

// Regression floor for the office navigation resolvers. Expectations are driven
// from MODULE_ACL membership so the rail composition stays single-sourced: the
// rail is exactly the ACL-allowed subset of its candidate module set, deduped by
// href. This pins the access surface before the contract refactor builds on it.

// Candidate modules the office rail can surface, in composition order:
// admin command modules + cross-workspace modules + branch-management modules.
const ADMIN_RAIL_MODULES: ModuleKey[] = [
  "dashboard",
  "reports",
  "staff",
  "settings",
];
const WORKSPACE_RAIL_MODULES: ModuleKey[] = [
  "menu",
  "orders",
  "inventory",
  "finance",
  "hr",
];
const BRANCH_MGMT_RAIL_MODULES: ModuleKey[] = [
  "branch_dashboard",
  "branch_settings",
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

// Expected hrefs for the non-branch (admin + workspace) part of the rail: the
// MODULE_ACL path for each candidate module the role can access.
function expectedTenantHrefs(role: StaffRole): string[] {
  return [...ADMIN_RAIL_MODULES, ...WORKSPACE_RAIL_MODULES]
    .filter((key) => canAccess(role, key))
    .map((key) => MODULE_ACL[key].path);
}

test("owner rail includes admin command + all workspaces + branch management", () => {
  const items = resolveOfficeRailItems("owner", BRANCH_ID);
  const hrefs = hrefSet(items);

  for (const key of [
    ...ADMIN_RAIL_MODULES,
    ...WORKSPACE_RAIL_MODULES,
  ]) {
    assert.equal(
      hrefs.has(MODULE_ACL[key].path),
      true,
      `owner rail must include ${key} (${MODULE_ACL[key].path})`,
    );
  }

  // Branch-management entries are present once a branchId is supplied and are
  // resolved to the concrete branch path.
  for (const key of BRANCH_MGMT_RAIL_MODULES) {
    const expectedHref = MODULE_ACL[key].path.replace("*", String(BRANCH_ID));
    const branchHref = `/br/${BRANCH_ID}`;
    assert.equal(
      items.some(
        (item) => item.href === expectedHref || item.href.startsWith(branchHref),
      ),
      true,
      `owner rail must include branch-management ${key} when branchId is given`,
    );
  }
});

test("owner rail omits branch-management entries without a branchId", () => {
  const items = resolveOfficeRailItems("owner");
  const branchHrefs = items.filter((item) => item.href.startsWith("/br/"));
  assert.deepEqual(branchHrefs, []);

  // The tenant-level admin + workspace entries remain.
  const hrefs = hrefSet(items);
  for (const href of expectedTenantHrefs("owner")) {
    assert.equal(hrefs.has(href), true, `owner rail must keep ${href}`);
  }
});

for (const role of RESTRICTED_ROLES) {
  test(`${role} rail exposes only MODULE_ACL-allowed tenant entries`, () => {
    const items = resolveOfficeRailItems(role);
    const hrefs = hrefList(items).filter((href) => !href.startsWith("/br/"));

    const expected = expectedTenantHrefs(role);
    assert.deepEqual(
      [...hrefs].sort(),
      [...expected].sort(),
      `${role} rail tenant entries must equal its ACL-allowed subset`,
    );

    // A restricted role must never see an admin-only module it cannot access.
    for (const key of [...ADMIN_RAIL_MODULES, ...WORKSPACE_RAIL_MODULES]) {
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

test("rail hrefs are deduplicated", () => {
  for (const role of ["owner", ...RESTRICTED_ROLES] as StaffRole[]) {
    const items = resolveOfficeRailItems(role, BRANCH_ID);
    const hrefs = hrefList(items);
    assert.equal(
      hrefs.length,
      new Set(hrefs).size,
      `${role} rail must not contain duplicate hrefs`,
    );
  }
});

test("findActiveRailItem matches the rail entry for the current path", () => {
  const items = resolveOfficeRailItems("owner", BRANCH_ID);
  const reportsHref = MODULE_ACL.reports.path;
  const active = findActiveRailItem(items, reportsHref);
  assert.ok(active, "an active rail item must be found for the reports path");
  assert.equal(active?.href, reportsHref);
});

test("findActiveRailItem returns undefined for an unmatched path", () => {
  const items = resolveOfficeRailItems("owner", BRANCH_ID);
  assert.equal(findActiveRailItem(items, "/totally/unknown/path"), undefined);
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
