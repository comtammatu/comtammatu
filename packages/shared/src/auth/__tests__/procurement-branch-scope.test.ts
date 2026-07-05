import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCUREMENT_PO_ROLES,
  PROCUREMENT_ROLES,
  isBranchScopedProcurementRole,
  isProcurementBranchInScope,
} from "../inventory-roles";

// D068 cross-branch guard. The real guard `canAccessProcurementBranch`
// (grn-actions.ts) resolves the actor's own operable branch into
// `effectiveBranchId`, then returns
// `isProcurementBranchInScope(role, effectiveBranchId, targetBranchId)`. For a
// pinned branch role (branch_manager / warehouse_manager / production_manager)
// claims carry a non-null branch_id, so `effectiveBranchId` is that claim and
// the async central-home fallback never fires. These tests exercise the REAL
// exported decision function (not a reconstruction), so a regression in the
// guard body itself is caught: RED before branch_manager is added to
// `isBranchScopedProcurementRole` (the decision falls through to the
// tenant-wide `return true` and wrongly admits a foreign-branch write), and
// RED if the `===` own-branch check is flipped. GREEN after.

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

test("central-site scoped roles keep strict own-branch equality (no regression)", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    assert.equal(isProcurementBranchInScope(role, 3, 4), false);
    assert.equal(isProcurementBranchInScope(role, 3, 3), true);
  }
});

test("owner is tenant-wide — not branch-scoped, any target allowed", () => {
  assert.equal(isBranchScopedProcurementRole("owner"), false);
  assert.equal(isProcurementBranchInScope("owner", 1, 999), true);
});

// D068 §Conflicts-resolved 2 — PO stays closed to branches. All
// purchase-order-actions.ts entries gate on PROCUREMENT_PO_ROLES, which must
// reject branch_manager by role (independent of any grant). RED before the
// PROCUREMENT_PO_ROLES split (branch_manager was in the shared PROCUREMENT_ROLES
// the PO actions pointed at), GREEN after.
test("branch_manager is REJECTED by role on createPurchaseOrder / createPurchaseOrderWithLines (PROCUREMENT_PO_ROLES)", () => {
  assert.equal(PROCUREMENT_PO_ROLES.includes("branch_manager"), false);
});

test("PROCUREMENT_PO_ROLES stays exactly the central procurement roles", () => {
  assert.deepEqual([...PROCUREMENT_PO_ROLES], [
    "owner",
    "warehouse_manager",
    "production_manager",
  ]);
});

test("branch_manager IS admitted by the coarse PROCUREMENT_ROLES gate (GRN + supplier + shared reads)", () => {
  assert.equal(PROCUREMENT_ROLES.includes("branch_manager"), true);
});
