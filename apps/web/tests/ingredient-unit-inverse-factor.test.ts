import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveEffectiveUnitFactor,
  inverseFactorToStored,
  resolveFactorDisplay,
} from "../app/(protected)/inventory/ingredients/ingredient-unit-form-model";
import type { UnitOption } from "../lib/inventory/types";

// Warehouse scenario: base kg; 1 pack = 0.5 kg; 1 pack = 100 pieces.
const kg: UnitOption = {
  id: 1,
  code: "kg",
  name: "Kilogram",
  dimension: "mass",
  is_standard: true,
  standard_factor: 1000,
};
const pack: UnitOption = {
  id: 2,
  code: "bich",
  name: "Bich",
  dimension: null,
  is_standard: false,
  standard_factor: null,
};
const piece: UnitOption = {
  id: 3,
  code: "cai",
  name: "Cai",
  dimension: null,
  is_standard: false,
  standard_factor: null,
};
const unitOptions = [kg, pack, piece];

test("stored factors below 1 display as inverse whole counts", () => {
  assert.deepEqual(resolveFactorDisplay(0.01), {
    mode: "inverse",
    value: "100",
  });
  assert.deepEqual(resolveFactorDisplay("0.005"), {
    mode: "inverse",
    value: "200",
  });
  // Counts above 1 stay direct; null stays empty direct.
  assert.deepEqual(resolveFactorDisplay(0.5), { mode: "direct", value: "0.5" });
  assert.deepEqual(resolveFactorDisplay(24), { mode: "direct", value: "24" });
  assert.deepEqual(resolveFactorDisplay(null), { mode: "direct", value: "" });
});

test("non-representable reciprocals stay direct instead of losing precision", () => {
  // 1/3 cannot fit numeric(18,9): keep the stored direction.
  assert.deepEqual(resolveFactorDisplay(0.333333333), {
    mode: "direct",
    value: "0.333333333",
  });
});

test("inverse input converts to the stored direct factor", () => {
  assert.equal(inverseFactorToStored("100"), 0.01);
  assert.equal(inverseFactorToStored(" 8 "), 0.125);
  // 1/24 repeats forever; 1/3 does too — neither is storable.
  assert.equal(inverseFactorToStored("24"), null);
  assert.equal(inverseFactorToStored("3"), null);
  assert.equal(inverseFactorToStored("0"), null);
  assert.equal(inverseFactorToStored(""), null);
});

test("pack and piece chain prices correctly in base units", () => {
  const relations = {
    unitIds: [1, 2, 3],
    baseUnitId: 1,
    anchorUnitIds: { 1: null, 2: 1, 3: 2 },
    anchorFactors: { 1: null, 2: 0.5, 3: inverseFactorToStored("100") },
    unitOptions,
  };
  assert.equal(deriveEffectiveUnitFactor(relations, 2), 0.5);
  assert.equal(deriveEffectiveUnitFactor(relations, 3), 0.005);
});
