import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  canAccessProductionSurface,
  canManageProductionRecipes,
  isProductionBranchKind,
  isProductionBranchScopedRole,
} from "../app/(protected)/inventory/_lib/production-roles";

const productionDataSource = readFileSync(
  new URL("../app/(protected)/inventory/production-data.ts", import.meta.url),
  "utf8",
);

// D091 — branch production. `branch_manager` runs production only at its OWN
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

test("central kitchen lead is admitted and pinned to its production site", () => {
  assert.equal(canAccessProductionSurface("central_kitchen_lead"), true);
  assert.equal(isProductionBranchScopedRole("central_kitchen_lead"), true);
  assert.equal(productionTargetAllowed("central_kitchen_lead", 16, 15), false);
});

test("branch-scoped production targets are wired to the actor site", () => {
  assert.match(
    productionDataSource,
    /targetBranches = targetBranches\.filter\(\s*\(branch\) => branch\.id === scopedBranchId,/,
  );
});

test("central supply operator cannot open production", () => {
  assert.equal(canAccessProductionSurface("central_supply_ops"), false);
});

test("branch_manager (branch_id=X) is REJECTED creating a production order for a foreign branch Y≠X", () => {
  assert.equal(productionTargetAllowed("branch_manager", 1, 2), false);
});

test("branch_manager (branch_id=X) is ALLOWED creating a production order for its own branch X", () => {
  assert.equal(productionTargetAllowed("branch_manager", 1, 1), true);
});

test("owner is tenant-wide for production — not branch-scoped", () => {
  assert.equal(isProductionBranchScopedRole("owner"), false);
  assert.equal(productionTargetAllowed("owner", 1, 999), true);
});

test("only owner and central kitchen lead manage production recipes", () => {
  assert.equal(canManageProductionRecipes("owner"), true);
  assert.equal(canManageProductionRecipes("central_kitchen_lead"), true);
  assert.equal(canManageProductionRecipes("branch_manager"), false);
});

test("production branch kinds accept both central_kitchen and branch (D091), reject others", () => {
  assert.equal(isProductionBranchKind("central_kitchen"), true);
  assert.equal(isProductionBranchKind("branch"), true);
  assert.equal(isProductionBranchKind("central_supply"), false);
  assert.equal(isProductionBranchKind("retail"), false);
  assert.equal(isProductionBranchKind(null), false);
});

test("branch_manager can open the production surface (operator role set)", () => {
  assert.equal(canAccessProductionSurface("branch_manager"), true);
});
