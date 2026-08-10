import test from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_CATALOG_VIEW_ROLES,
  PO_CREATE_ROLES,
  PO_REVIEW_ROLES,
  SUPPLIER_RETURN_ROLES,
} from "../inventory-roles";

test("ingredient catalog writes are owner-only", () => {
  assert.deepEqual(INVENTORY_CATALOG_ROLES, ["owner"]);
});

test("ingredient catalog read includes central ops", () => {
  assert.deepEqual(INVENTORY_CATALOG_VIEW_ROLES, [
    "owner",
    "central_supply_ops",
    "central_kitchen_lead",
  ]);
});

test("PO create is Owner|Accountant only; central ops hard-denied", () => {
  assert.deepEqual([...PO_CREATE_ROLES], ["owner", "accountant"]);
  assert.equal(PO_CREATE_ROLES.includes("central_supply_ops"), false);
  assert.equal(PO_CREATE_ROLES.includes("central_kitchen_lead"), false);
  assert.deepEqual([...PO_REVIEW_ROLES], ["owner", "accountant"]);
});

test("supplier-return residual gate excludes branch_manager (R08)", () => {
  assert.deepEqual([...SUPPLIER_RETURN_ROLES], ["owner"]);
  assert.equal(SUPPLIER_RETURN_ROLES.includes("branch_manager"), false);
});
