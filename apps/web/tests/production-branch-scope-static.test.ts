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

// D093 — central-kitchen production only. `branch_manager` no longer runs
// production. Two guards realize own-site pinning for `central_kitchen_lead`:
// (1) `productionBranches` is filtered to `scopedBranchId` when
// `isProductionBranchScopedRole(role)` (production-data.ts), and (2)
// `hasCurrentProductionBranchAccess` / `requireProductionBranch` accept a
// production branch kind (`central_kitchen` only).
function productionTargetAllowed(
  role: StaffRole,
  scopedBranchId: number,
  targetBranchId: number,
): boolean {
  if (!isProductionBranchScopedRole(role)) return true;
  return scopedBranchId === targetBranchId;
}

test("branch_manager is not a branch-scoped production role (D093)", () => {
  assert.equal(isProductionBranchScopedRole("branch_manager"), false);
});

test("central kitchen lead is admitted and pinned to its production site", () => {
  assert.equal(canAccessProductionSurface("central_kitchen_lead"), true);
  assert.equal(isProductionBranchScopedRole("central_kitchen_lead"), true);
  assert.equal(productionTargetAllowed("central_kitchen_lead", 16, 15), false);
});

test("branch-scoped production targets are wired to the actor site", () => {
  assert.match(
    productionDataSource,
    /productionBranches = productionBranches\.filter\(\s*\(branch\) => branch\.id === scopedBranchId,/,
  );
  assert.match(productionDataSource, /branch\.branch_kind === "central_kitchen"/);
});

test("central supply operator cannot open production", () => {
  assert.equal(canAccessProductionSurface("central_supply_ops"), false);
});

test("central_kitchen_lead (branch_id=X) is REJECTED creating a production order for a foreign branch Y≠X", () => {
  assert.equal(productionTargetAllowed("central_kitchen_lead", 1, 2), false);
});

test("central_kitchen_lead (branch_id=X) is ALLOWED creating a production order for its own branch X", () => {
  assert.equal(productionTargetAllowed("central_kitchen_lead", 1, 1), true);
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

test("production branch kinds accept central_kitchen only (D093), reject branch and others", () => {
  assert.equal(isProductionBranchKind("central_kitchen"), true);
  assert.equal(isProductionBranchKind("branch"), false);
  assert.equal(isProductionBranchKind("central_supply"), false);
  assert.equal(isProductionBranchKind("retail"), false);
  assert.equal(isProductionBranchKind(null), false);
});

test("branch_manager cannot open the production surface (D093)", () => {
  assert.equal(canAccessProductionSurface("branch_manager"), false);
});
