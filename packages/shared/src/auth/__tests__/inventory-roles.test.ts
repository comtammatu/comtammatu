import test from "node:test";
import assert from "node:assert/strict";
import { INVENTORY_CATALOG_ROLES } from "../inventory-roles";

test("ingredient catalog writes are owner-only", () => {
  assert.deepEqual(INVENTORY_CATALOG_ROLES, ["owner"]);
});
