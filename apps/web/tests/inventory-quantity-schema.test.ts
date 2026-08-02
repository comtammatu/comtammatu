import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inventoryNonnegativeQuantitySchema,
  inventoryNonzeroQuantitySchema,
  inventoryPositiveQuantitySchema,
} from "../app/(protected)/inventory/_lib/inventory-quantity-schema";

test("inventory quantity boundary accepts scale 3 and rejects unsafe numeric forms", () => {
  assert.equal(inventoryPositiveQuantitySchema.parse("12.345"), 12.345);
  assert.equal(inventoryNonnegativeQuantitySchema.parse("0.001"), 0.001);
  assert.equal(inventoryNonzeroQuantitySchema.parse("-0.001"), -0.001);

  for (const value of ["12.3456", "1e3", "NaN", "Infinity", "1,5", ""]) {
    assert.equal(inventoryPositiveQuantitySchema.safeParse(value).success, false);
  }
  assert.equal(
    inventoryPositiveQuantitySchema.safeParse(Number.POSITIVE_INFINITY).success,
    false,
  );
  assert.equal(
    inventoryPositiveQuantitySchema.safeParse(Number.MAX_SAFE_INTEGER).success,
    false,
  );
});
