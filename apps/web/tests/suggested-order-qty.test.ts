import assert from "node:assert/strict";
import test from "node:test";
import {
  suggestedOrderQtyBase,
  suggestedOrderQtyInEntryUnit,
} from "../lib/inventory/suggested-order-qty.ts";

test("INV-10 suggestedOrderQtyBase uses min - current only", () => {
  assert.equal(suggestedOrderQtyBase(10, 4), 6);
  assert.equal(suggestedOrderQtyBase(10, 10), 0);
  assert.equal(suggestedOrderQtyBase(10, 12), 0);
  assert.equal(suggestedOrderQtyBase(null, 4), 0);
  assert.equal(suggestedOrderQtyBase(0, 4), 0);
});

test("INV-10 suggestedOrderQtyInEntryUnit converts pack factor", () => {
  assert.equal(suggestedOrderQtyInEntryUnit(10, 1), 10);
  assert.equal(suggestedOrderQtyInEntryUnit(10, 5), 2);
  assert.equal(suggestedOrderQtyInEntryUnit(11, 5), 2.2);
  assert.equal(suggestedOrderQtyInEntryUnit(0, 5), 0);
});
