import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productionQuantityFromBase,
  productionQuantityToBase,
} from "../app/(protected)/inventory/_lib/production-unit-conversion";

test("production output quantities are converted through the selected unit factor", () => {
  assert.equal(productionQuantityToBase(15, 0.2), 3);
  assert.equal(productionQuantityFromBase(3, 0.2), 15);
  assert.equal(productionQuantityToBase(1, 24), 24);
  assert.equal(productionQuantityFromBase(48, 24), 2);
  assert.equal(productionQuantityToBase(1500, 0.001), 1.5);
  assert.equal(productionQuantityFromBase(1.5, 0.001), 1500);
});

test("production output conversion fails closed for invalid quantities or factors", () => {
  assert.equal(productionQuantityToBase(1, null), null);
  assert.equal(productionQuantityToBase(1, 0), null);
  assert.equal(productionQuantityToBase(Number.NaN, 1), null);
  assert.equal(productionQuantityFromBase(1, undefined), null);
  assert.equal(productionQuantityFromBase(Number.NaN, 1), null);
});
