import test from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_CATALOG_VIEW_ROLES,
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
