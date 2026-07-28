import test from "node:test";
import assert from "node:assert/strict";
import { getInventoryValueVisibility } from "../inventory-value";

test("inventory valuation visibility follows server capability", () => {
  assert.deepEqual(getInventoryValueVisibility(false, false), {
    system: false,
    branch: false,
  });
  assert.deepEqual(getInventoryValueVisibility(true, false), {
    system: false,
    branch: true,
  });
  assert.deepEqual(getInventoryValueVisibility(true, true), {
    system: true,
    branch: true,
  });
});
