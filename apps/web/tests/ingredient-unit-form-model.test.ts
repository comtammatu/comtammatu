import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCatalogUnits,
  IngredientUnitModelError,
  readCatalogUnitModel,
  rebaseUnitFactors,
} from "../app/(protected)/inventory/ingredients/ingredient-unit-form-model";
import type { UnitOption } from "../lib/inventory/types";

const units: UnitOption[] = [
  {
    id: 1,
    code: "g",
    name: "Gram",
    dimension: "mass",
    is_standard: true,
    standard_factor: 1,
  },
  {
    id: 2,
    code: "kg",
    name: "Kilogram",
    dimension: "mass",
    is_standard: true,
    standard_factor: 1000,
  },
  {
    id: 3,
    code: "ml",
    name: "Mililít",
    dimension: "volume",
    is_standard: true,
    standard_factor: 1,
  },
  {
    id: 4,
    code: "l",
    name: "Lít",
    dimension: "volume",
    is_standard: true,
    standard_factor: 1000,
  },
  {
    id: 5,
    code: "bao",
    name: "Bao",
    dimension: null,
    is_standard: false,
    standard_factor: null,
  },
  {
    id: 6,
    code: "chai",
    name: "Chai",
    dimension: null,
    is_standard: false,
    standard_factor: null,
  },
  {
    id: 7,
    code: "thung",
    name: "Thùng",
    dimension: null,
    is_standard: false,
    standard_factor: null,
  },
];

test("selected units produce a deduplicated payload with one standard unit", () => {
  const rows = buildCatalogUnits({
    unitIds: [1, 2, 5, 2],
    baseUnitId: 2,
    factors: { 1: 0.001, 2: 1, 5: 50 },
    unitOptions: units,
  });

  assert.deepEqual(
    rows.map((row) => row.unit_id),
    [1, 2, 5],
  );
  assert.equal(rows.filter((row) => row.is_base).length, 1);
  assert.deepEqual(
    rows.find((row) => row.unit_id === 1),
    {
      unit_id: 1,
      to_base_factor: 0.001,
      is_base: false,
      anchor_unit_id: null,
      anchor_factor: null,
    },
  );
});

test("changing the base preserves every physical ratio", () => {
  const rebased = rebaseUnitFactors({ 5: 50, 2: 1, 1: 0.001 }, 1);
  assert.deepEqual(rebased, { 1: 1, 2: 1000, 5: 50000 });
  assert.equal(rebased[5]! / rebased[2]!, 50);
});

test("new items use the first selected unit while edits preserve the stored base", () => {
  assert.equal(readCatalogUnitModel([], 2).baseUnitId, 2);
  assert.equal(
    readCatalogUnitModel(
      [
        { unit_id: 2, to_base_factor: 0.1, is_base: false },
        { unit_id: 5, to_base_factor: 1, is_base: true },
      ],
      2,
    ).baseUnitId,
    5,
  );

  const rows = buildCatalogUnits({
    unitIds: [5, 2],
    baseUnitId: 2,
    factors: { 5: 50 },
    unitOptions: units,
  });
  assert.equal(rows.find((row) => row.is_base)?.unit_id, 2);
});

test("standard mass and volume factors come from the registry", () => {
  const mass = buildCatalogUnits({
    unitIds: [2, 1],
    baseUnitId: 1,
    factors: {},
    unitOptions: units,
  });
  const volume = buildCatalogUnits({
    unitIds: [4, 3],
    baseUnitId: 3,
    factors: {},
    unitOptions: units,
  });
  assert.equal(mass.find((row) => row.unit_id === 2)?.to_base_factor, 1000);
  assert.equal(volume.find((row) => row.unit_id === 4)?.to_base_factor, 1000);
});

test("packaging units use a direct manual anchor to the base", () => {
  const rows = buildCatalogUnits({
    unitIds: [7, 6, 3],
    baseUnitId: 3,
    factors: { 7: 6000, 6: 250 },
    unitOptions: units,
  });
  assert.deepEqual(
    rows.find((row) => row.unit_id === 7),
    {
      unit_id: 7,
      to_base_factor: 6000,
      is_base: false,
      anchor_unit_id: 3,
      anchor_factor: 6000,
    },
  );
});

test("invalid factors, cross-dimension standards and an unselected base fail closed", () => {
  for (const factor of [undefined, 0, -1]) {
    assert.throws(
      () =>
        buildCatalogUnits({
          unitIds: [5, 2],
          baseUnitId: 2,
          factors: factor == null ? {} : { 5: factor },
          unitOptions: units,
        }),
      (error: unknown) =>
        error instanceof IngredientUnitModelError &&
        error.message === "invalid_factor",
    );
  }
  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [2, 3],
        baseUnitId: 3,
        factors: {},
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "standard_unit_dimension_mismatch",
  );
  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [5, 2],
        baseUnitId: 6,
        factors: {},
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "base_unit_not_selected",
  );
});
