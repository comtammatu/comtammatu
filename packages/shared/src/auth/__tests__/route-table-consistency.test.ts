import test from "node:test";
import assert from "node:assert/strict";

import { canAccess, type ModuleKey } from "../module-acl";
import { STAFF_ROLES } from "../types";
import { ROUTE_FAMILY_CONTRACTS } from "../route-map";
import { resolveModuleFromPath } from "../route-resolution";
import {
  CONTROL_SURFACE_NAV_GROUPS,
  BRANCH_MANAGEMENT_ITEMS,
  OPERATOR_TILE_ITEMS,
  BRANCH_PRIMARY_TAB_ITEMS,
  BRANCH_TOOLS_ITEMS,
} from "../nav-config";
import {
  resolveControlSurfaceNavGroups,
  resolveBranchManagementItems,
} from "../nav-resolution";

// Guards the route-table contract (D058 W0): every path a route family
// declares reachable, and every href the nav resolvers produce, must resolve
// (via resolveModuleFromPath, the function proxy.ts/middleware actually
// enforces) to a module the family/role is supposed to have. A declared
// moduleKey with no matching enforcement (or vice versa) is a silent ACL gap.

const BRANCH_ID = "7";

// A realistic one-level-deeper path for families whose matchPrefixes root
// implies real sub-routes, grounded in actual page.tsx directories rather
// than a synthetic segment (some roots only resolve their
// own explicit sub-prefixes — an arbitrary child would fall through to
// null and is not representative of the family's real route space).
const DEEPER_SUBPATH_BY_PREFIX: Record<string, string> = {
  "/settings": "/settings/general",
  "/menu": "/menu/categories",
  "/promotions": "/promotions/new",
  "/orders": "/orders/history",
  "/inventory": "/inventory/stock",
  "/finance": "/finance/revenue",
  "/branches": "/branches/settings",
  "/hr": "/hr/staff",
  "/notifications": "/notifications/settings",
  "/me": "/me/clock",
  "/br/[branchId]/shift": `/br/${BRANCH_ID}/shift/clock`,
  "/br/[branchId]/shift/checkout-approvals": `/br/${BRANCH_ID}/shift/checkout-approvals`,
  "/br/[branchId]/shift/leave-approvals": `/br/${BRANCH_ID}/shift/leave-approvals`,
  "/br/[branchId]/shift/roster": `/br/${BRANCH_ID}/shift/roster`,
  "/br/[branchId]/team/checkout-approvals": `/br/${BRANCH_ID}/team/checkout-approvals`,
  "/br/[branchId]/team/leave-approvals": `/br/${BRANCH_ID}/team/leave-approvals`,
  "/br/[branchId]/team/roster": `/br/${BRANCH_ID}/team/roster`,
  "/br/[branchId]/team/attendance": `/br/${BRANCH_ID}/team/attendance`,
  "/br/[branchId]/profile": `/br/${BRANCH_ID}/profile/edit`,
  "/br/[branchId]/stock": `/br/${BRANCH_ID}/stock/waste`,
  "/br/[branchId]/menu-limits": `/br/${BRANCH_ID}/menu-limits`,
  "/br/[branchId]/pos-sessions": `/br/${BRANCH_ID}/pos-sessions`,
  "/br/[branchId]/settings": `/br/${BRANCH_ID}/settings/tables`,
  "/br/[branchId]/dashboard": `/br/${BRANCH_ID}/dashboard`,
  "/br/[branchId]/pos": `/br/${BRANCH_ID}/pos`,
  "/br/[branchId]/kds": `/br/${BRANCH_ID}/kds`,
  "/br/[branchId]/pickup": `/br/${BRANCH_ID}/pickup`,
};

function substituteBranchId(prefix: string): string {
  return prefix.replace("[branchId]", BRANCH_ID);
}

function concretePathsForPrefix(prefix: string): string[] {
  const root = substituteBranchId(prefix);
  const deeper = DEEPER_SUBPATH_BY_PREFIX[prefix];
  return deeper && deeper !== root ? [root, deeper] : [root];
}

test("every ROUTE_FAMILY_CONTRACTS entry's concrete paths resolve to a declared moduleKey", () => {
  const failures: string[] = [];

  for (const family of ROUTE_FAMILY_CONTRACTS) {
    if (family.moduleKeys.length === 0) {
      // "public" family: intentionally has no ACL module (isPublicAppPath
      // short-circuits before resolveModuleFromPath in resolveRouteFamilyContract).
      continue;
    }

    for (const prefix of family.matchPrefixes) {
      for (const path of concretePathsForPrefix(prefix)) {
        const resolved = resolveModuleFromPath(path);
        const moduleKeys: readonly ModuleKey[] = family.moduleKeys;
        if (!resolved || !moduleKeys.includes(resolved)) {
          failures.push(
            `family "${family.id}" prefix "${prefix}" -> path "${path}" resolved to "${resolved ?? "null"}", expected one of [${family.moduleKeys.join(", ")}]`,
          );
        }
      }
    }
  }

  assert.equal(
    failures.length,
    0,
    `Route table drift between route-map.ts and route-resolution.ts:\n${failures.join("\n")}`,
  );
});

function assertHrefResolvesForAudience(
  href: string,
  audienceRoles: readonly string[],
  failures: string[],
): void {
  const resolved = resolveModuleFromPath(href);
  if (!resolved) {
    failures.push(`href "${href}" resolved to no module`);
    return;
  }

  const reachable = audienceRoles.some((role) =>
    canAccess(role as (typeof STAFF_ROLES)[number], resolved),
  );
  if (!reachable) {
    failures.push(
      `href "${href}" resolved to module "${resolved}", but none of [${audienceRoles.join(", ")}] can access it`,
    );
  }
}

test("resolveControlSurfaceNavGroups hrefs resolve to a module reachable by an owner audience", () => {
  const failures: string[] = [];

  for (const group of CONTROL_SURFACE_NAV_GROUPS) {
    for (const item of group.items) {
      const audienceRoles = STAFF_ROLES.filter((role) =>
        resolveControlSurfaceNavGroups(role).some((resolvedGroup) =>
          resolvedGroup.items.some((link) => link.moduleKey === item.moduleKey),
        ),
      );
      if (audienceRoles.length === 0) continue;

      const sampleRole = audienceRoles[0]!;
      const link = resolveControlSurfaceNavGroups(sampleRole)
        .flatMap((resolvedGroup) => resolvedGroup.items)
        .find((navLink) => navLink.moduleKey === item.moduleKey);
      assert.ok(link, `expected a resolved link for ${item.moduleKey}`);
      assertHrefResolvesForAudience(link.href, audienceRoles, failures);
    }
  }

  assert.equal(failures.length, 0, failures.join("\n"));
});

test("resolveBranchManagementItems hrefs resolve to a module reachable by an audience role", () => {
  const failures: string[] = [];

  for (const item of BRANCH_MANAGEMENT_ITEMS) {
    const audienceRoles = STAFF_ROLES.filter((role) =>
      resolveBranchManagementItems(role, Number(BRANCH_ID)).some(
        (link) => link.moduleKey === item.moduleKey,
      ),
    );
    if (audienceRoles.length === 0) continue;

    const sampleRole = audienceRoles[0]!;
    const link = resolveBranchManagementItems(
      sampleRole,
      Number(BRANCH_ID),
    ).find((navLink) => navLink.moduleKey === item.moduleKey);
    assert.ok(link, `expected a resolved link for ${item.moduleKey}`);
    assertHrefResolvesForAudience(link.href, audienceRoles, failures);
  }

  assert.equal(failures.length, 0, failures.join("\n"));
});

test("OPERATOR_TILE_ITEMS hrefTemplates resolve to a module reachable by an audience role", () => {
  const failures: string[] = [];

  for (const tile of OPERATOR_TILE_ITEMS) {
    const audienceRoles = STAFF_ROLES.filter((role) =>
      canAccess(role, tile.moduleKey),
    );
    if (audienceRoles.length === 0) continue;

    const href = tile.hrefTemplate.replace("{branchId}", BRANCH_ID);
    assertHrefResolvesForAudience(href, audienceRoles, failures);
  }

  assert.equal(failures.length, 0, failures.join("\n"));
});

test("BRANCH_TOOLS_ITEMS hrefTemplates resolve to a module reachable by an audience role", () => {
  const failures: string[] = [];

  for (const tile of BRANCH_TOOLS_ITEMS) {
    const audienceRoles = STAFF_ROLES.filter((role) =>
      canAccess(role, tile.moduleKey),
    );
    if (audienceRoles.length === 0) continue;

    const href = tile.hrefTemplate.replace("{branchId}", BRANCH_ID);
    assertHrefResolvesForAudience(href, audienceRoles, failures);
  }

  assert.equal(failures.length, 0, failures.join("\n"));
});

test("BRANCH_PRIMARY_TAB_ITEMS hrefTemplates resolve to a module reachable by an audience role", () => {
  const failures: string[] = [];

  for (const tab of BRANCH_PRIMARY_TAB_ITEMS) {
    const audienceRoles = STAFF_ROLES.filter((role) =>
      canAccess(role, tab.moduleKey),
    );
    if (audienceRoles.length === 0) continue;

    const href = tab.hrefTemplate.replace("{branchId}", BRANCH_ID);
    assertHrefResolvesForAudience(href, audienceRoles, failures);
  }

  assert.equal(failures.length, 0, failures.join("\n"));
});
