import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCUREMENT_ROLES,
  isBranchScopedProcurementRole,
  isProcurementBranchInScope,
} from "../inventory-roles";

// D091 cross-branch guard. The real guard `canAccessProcurementBranch`
// (grn-actions.ts) uses the actor's own claims.branch_id as
// `effectiveBranchId`, then returns
// `isProcurementBranchInScope(role, effectiveBranchId, targetBranchId)`. These
// tests exercise the REAL exported decision function (not a reconstruction),
// so a regression in the guard body itself is caught: RED before
// branch_manager is added to `isBranchScopedProcurementRole` (the decision
// falls through to the tenant-wide `return true` and wrongly admits a
// foreign-branch write), and RED if the `===` own-branch check is flipped.
// GREEN after.

test("branch_manager is a branch-scoped procurement role (own-branch equality applies)", () => {
  assert.equal(isBranchScopedProcurementRole("branch_manager"), true);
});

test("branch_manager (branch_id=X) is REJECTED writing a GRN for a foreign branch Y≠X", () => {
  // The highest-risk gap: without branch_manager in the predicate this returns
  // true and branch A writes a GRN for branch B (client-supplied branch_id).
  assert.equal(isProcurementBranchInScope("branch_manager", 1, 2), false);
});

test("branch_manager (branch_id=X) is ALLOWED writing a GRN for its own branch X", () => {
  assert.equal(isProcurementBranchInScope("branch_manager", 1, 1), true);
});

test("owner is tenant-wide — not branch-scoped, any target allowed", () => {
  assert.equal(isBranchScopedProcurementRole("owner"), false);
  assert.equal(isProcurementBranchInScope("owner", 1, 999), true);
});

test("branch_manager IS admitted by the coarse PROCUREMENT_ROLES gate (GRN + supplier + shared reads)", () => {
  assert.equal(PROCUREMENT_ROLES.includes("branch_manager"), true);
});
