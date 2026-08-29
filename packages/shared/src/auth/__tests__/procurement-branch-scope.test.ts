import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCUREMENT_ROLES,
  STOCK_REQUEST_ROLES,
  isBranchScopedProcurementRole,
  isProcurementBranchInScope,
} from "../inventory-roles";

// D093: branch_manager is NOT a procurement (GRN) writer. Central roles remain
// branch-scoped for their pinned site.

test("branch_manager is NOT a branch-scoped procurement role (D093)", () => {
  assert.equal(isBranchScopedProcurementRole("branch_manager"), false);
});

test("central_kitchen_lead is branch-scoped for own-site GRN writes", () => {
  assert.equal(isBranchScopedProcurementRole("central_kitchen_lead"), true);
  assert.equal(isProcurementBranchInScope("central_kitchen_lead", 1, 2), false);
  assert.equal(isProcurementBranchInScope("central_kitchen_lead", 1, 1), true);
});

test("central_supply_ops is tenant-wide — not branch-scoped for GRN writes", () => {
  assert.equal(isBranchScopedProcurementRole("central_supply_ops"), false);
  assert.equal(isProcurementBranchInScope("central_supply_ops", 1, 2), true);
  assert.equal(isProcurementBranchInScope("central_supply_ops", 1, 1), true);
});

test("owner is tenant-wide — not branch-scoped, any target allowed", () => {
  assert.equal(isBranchScopedProcurementRole("owner"), false);
  assert.equal(isProcurementBranchInScope("owner", 1, 999), true);
});

test("branch_manager is NOT in PROCUREMENT_ROLES (D093 — no branch GRN)", () => {
  assert.equal(PROCUREMENT_ROLES.includes("branch_manager"), false);
});

test("branch_manager IS in STOCK_REQUEST_ROLES (D093)", () => {
  assert.equal(STOCK_REQUEST_ROLES.includes("branch_manager"), true);
});
