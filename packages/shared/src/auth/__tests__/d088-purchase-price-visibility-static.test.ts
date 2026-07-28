import test from "node:test";
import assert from "node:assert/strict";
import {
  canViewPurchasePrice,
  getInventoryValueVisibility,
} from "../inventory-value";

test("D088 branch_manager cannot view purchase prices or branch valuation", () => {
  assert.equal(canViewPurchasePrice("branch_manager"), false);
  assert.equal(canViewPurchasePrice("owner"), true);
  assert.equal(canViewPurchasePrice("accountant"), true);
  assert.equal(canViewPurchasePrice("central_supply_ops"), true);
  assert.deepEqual(getInventoryValueVisibility("branch_manager"), {
    system: false,
    branch: false,
  });
  assert.equal(getInventoryValueVisibility("owner").system, true);
});
