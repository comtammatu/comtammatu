import test from "node:test";
import assert from "node:assert/strict";
import { INVENTORY_CATALOG_ROLES } from "../inventory-roles";

test("ingredient catalog writes use the multi-warehouse catalog roles", () => {
  assert.deepEqual(INVENTORY_CATALOG_ROLES, [
    "owner",
    "warehouse_manager",
    "production_manager",
  ]);
});
