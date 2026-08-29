import test from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_CATALOG_VIEW_ROLES,
  INVENTORY_TENANT_READ_ROLES,
  PO_CREATE_ROLES,
  PO_MUTATE_ROLES,
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

test("PO create includes central warehouse roles; BM stays out", () => {
  assert.deepEqual(
    [...PO_CREATE_ROLES],
    ["owner", "accountant", "central_supply_ops", "central_kitchen_lead"],
  );
  assert.equal(PO_CREATE_ROLES.includes("branch_manager"), false);
  assert.deepEqual([...PO_REVIEW_ROLES], ["owner", "accountant"]);
  assert.deepEqual(
    [...PO_MUTATE_ROLES],
    ["owner", "accountant", "central_supply_ops", "central_kitchen_lead"],
  );
});

test("inventory tenant read includes central_supply_ops", () => {
  assert.deepEqual(
    [...INVENTORY_TENANT_READ_ROLES],
    ["owner", "self_service", "accountant", "central_supply_ops"],
  );
});

test("supplier-return gate includes central_supply_ops and excludes branch_manager (R08)", () => {
  assert.deepEqual([...SUPPLIER_RETURN_ROLES], [
    "owner",
    "central_supply_ops",
  ]);
  assert.equal(SUPPLIER_RETURN_ROLES.includes("branch_manager"), false);
});
