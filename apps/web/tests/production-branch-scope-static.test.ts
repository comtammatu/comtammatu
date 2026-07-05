import assert from "node:assert/strict";
import { test } from "node:test";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  canAccessProductionSurface,
  isProductionBranchKind,
  isProductionBranchScopedRole,
} from "../app/(protected)/inventory/_lib/production-roles";

// D068 — branch production. `branch_manager` runs production only at its OWN
// branch. Two guards realize this: (1) `productionBranches` is filtered to
// `scopedBranchId` when `isProductionBranchScopedRole(role)`
// (production-data.ts), and (2) `hasCurrentProductionBranchAccess` /
// `requireProductionBranch` accept a production branch kind. This reconstructs
// the own-branch selection decision using the REAL exported predicate — RED
// before branch_manager joins PRODUCTION_BRANCH_SCOPED_ROLES (it would fall
// through to `return true`/no-filter and a foreign branch would be selectable),
// GREEN after.
function productionTargetAllowed(
  role: StaffRole,
  scopedBranchId: number,
  targetBranchId: number,
): boolean {
  if (!isProductionBranchScopedRole(role)) return true;
  return scopedBranchId === targetBranchId;
}

test("branch_manager is a branch-scoped production role (own-branch pin applies)", () => {
  assert.equal(isProductionBranchScopedRole("branch_manager"), true);
});

test("branch_manager (branch_id=X) is REJECTED creating a production order for a foreign branch Y≠X", () => {
  assert.equal(productionTargetAllowed("branch_manager", 1, 2), false);
});

test("branch_manager (branch_id=X) is ALLOWED creating a production order for its own branch X", () => {
  assert.equal(productionTargetAllowed("branch_manager", 1, 1), true);
});

test("production_manager keeps strict own-branch pin (no regression)", () => {
  assert.equal(productionTargetAllowed("production_manager", 3, 4), false);
  assert.equal(productionTargetAllowed("production_manager", 3, 3), true);
});

test("owner is tenant-wide for production — not branch-scoped", () => {
  assert.equal(isProductionBranchScopedRole("owner"), false);
  assert.equal(productionTargetAllowed("owner", 1, 999), true);
});

test("production branch kinds accept both central_kitchen and branch (D068), reject others", () => {
  assert.equal(isProductionBranchKind("central_kitchen"), true);
  assert.equal(isProductionBranchKind("branch"), true);
  assert.equal(isProductionBranchKind("central_supply"), false);
  assert.equal(isProductionBranchKind("retail"), false);
  assert.equal(isProductionBranchKind(null), false);
});

test("branch_manager can open the production surface (operator role set)", () => {
  assert.equal(canAccessProductionSurface("branch_manager"), true);
});
