import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCUREMENT_PO_ROLES,
  PROCUREMENT_ROLES,
  isBranchScopedProcurementRole,
} from "../inventory-roles";
import type { StaffRole } from "../types";

// D068 cross-branch guard. `canAccessProcurementBranch` (grn-actions.ts /
// purchase-order-actions.ts) is `isBranchScopedProcurementRole(role)
// ? effectiveBranchId === targetBranchId : true`. For a pinned branch role
// (branch_manager / warehouse_manager / production_manager) claims carry a
// non-null branch_id, so `effectiveBranchId` is that claim and the async
// central-home fallback never fires. This reconstructs that exact decision
// using the REAL exported predicate, so the test is RED before branch_manager
// is added to `isBranchScopedProcurementRole` (it would fall through to the
// tenant-wide `return true` and wrongly admit a foreign-branch write) and
// GREEN after.
function canAccessProcurementBranchPinned(
  role: StaffRole,
  claimBranchId: number,
  targetBranchId: number,
): boolean {
  if (!isBranchScopedProcurementRole(role)) return true;
  return claimBranchId === targetBranchId;
}

test("branch_manager is a branch-scoped procurement role (own-branch equality applies)", () => {
  assert.equal(isBranchScopedProcurementRole("branch_manager"), true);
});

test("branch_manager (branch_id=X) is REJECTED creating a GRN for a foreign branch Y≠X", () => {
  // The highest-risk gap: without branch_manager in the predicate this returns
  // true and branch A writes a GRN for branch B (client-supplied branch_id).
  assert.equal(canAccessProcurementBranchPinned("branch_manager", 1, 2), false);
});

test("branch_manager (branch_id=X) is ALLOWED creating a GRN for its own branch X", () => {
  assert.equal(canAccessProcurementBranchPinned("branch_manager", 1, 1), true);
});

test("central-site scoped roles keep strict own-branch equality (no regression)", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    assert.equal(canAccessProcurementBranchPinned(role, 3, 4), false);
    assert.equal(canAccessProcurementBranchPinned(role, 3, 3), true);
  }
});

test("owner is tenant-wide — not branch-scoped, any target allowed", () => {
  assert.equal(isBranchScopedProcurementRole("owner"), false);
  assert.equal(canAccessProcurementBranchPinned("owner", 1, 999), true);
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
