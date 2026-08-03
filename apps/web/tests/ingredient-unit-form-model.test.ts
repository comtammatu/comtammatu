import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCatalogUnits,
  deriveEffectiveUnitFactor,
  deriveEffectiveUnitFactors,
  findDirectDependents,
  IngredientUnitModelError,
  isValidAnchorFactor,
  isValidEffectiveFactor,
  readCatalogUnitModel,
  rebaseUnitRelations,
  wouldCreateUnitCycle,
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
    anchorUnitIds: { 1: 2, 5: 2 },
    anchorFactors: { 1: null, 5: 50 },
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

test("new items use the first selected unit while edits preserve the stored base", () => {
  assert.equal(readCatalogUnitModel([], 2, units).baseUnitId, 2);
  assert.equal(
    readCatalogUnitModel(
      [
        { unit_id: 2, to_base_factor: 0.1, is_base: false },
        { unit_id: 5, to_base_factor: 1, is_base: true },
      ],
      2,
      units,
    ).baseUnitId,
    5,
  );

  const rows = buildCatalogUnits({
    unitIds: [5, 2],
    baseUnitId: 2,
    anchorUnitIds: { 5: 2 },
    anchorFactors: { 5: 50 },
    unitOptions: units,
  });
  assert.equal(rows.find((row) => row.is_base)?.unit_id, 2);
});

test("legacy direct-to-base inputs remain supported during the graph migration", () => {
  const model = readCatalogUnitModel(
    [
      { unit_id: 5, to_base_factor: 50, is_base: false },
      { unit_id: 2, to_base_factor: 1, is_base: true },
    ],
    2,
  );
  assert.deepEqual(model.factors, { 5: 50, 2: 1 });

  const rows = buildCatalogUnits({
    unitIds: [5, 2],
    baseUnitId: 2,
    factors: { 5: 50 },
    unitOptions: units,
  });
  assert.deepEqual(rows.find((row) => row.unit_id === 5), {
    unit_id: 5,
    to_base_factor: 50,
    is_base: false,
    anchor_unit_id: 2,
    anchor_factor: 50,
  });
});

test("standard mass and volume factors come from the registry", () => {
  const mass = buildCatalogUnits({
    unitIds: [2, 1],
    baseUnitId: 1,
    anchorUnitIds: { 2: 1 },
    anchorFactors: { 2: null },
    unitOptions: units,
  });
  const volume = buildCatalogUnits({
    unitIds: [4, 3],
    baseUnitId: 3,
    anchorUnitIds: { 4: 3 },
    anchorFactors: { 4: null },
    unitOptions: units,
  });
  assert.equal(mass.find((row) => row.unit_id === 2)?.to_base_factor, 1000);
  assert.equal(volume.find((row) => row.unit_id === 4)?.to_base_factor, 1000);
});

test("packaging units can form an acyclic chain to the base", () => {
  const rows = buildCatalogUnits({
    unitIds: [7, 6, 3],
    baseUnitId: 3,
    anchorUnitIds: { 7: 6, 6: 3 },
    anchorFactors: { 7: 24, 6: 250 },
    unitOptions: units,
  });
  assert.deepEqual(rows.find((row) => row.unit_id === 7), {
    unit_id: 7,
    to_base_factor: 6000,
    is_base: false,
    anchor_unit_id: 6,
    anchor_factor: 24,
  });
  assert.deepEqual(rows.find((row) => row.unit_id === 6), {
    unit_id: 6,
    to_base_factor: 250,
    is_base: false,
    anchor_unit_id: 3,
    anchor_factor: 250,
  });
});

test("invalid factors, cross-dimension standards and an unselected base fail closed", () => {
  for (const factor of [undefined, 0, -1]) {
    assert.throws(
      () =>
        buildCatalogUnits({
          unitIds: [5, 2],
          baseUnitId: 2,
          anchorUnitIds: { 5: 2 },
          anchorFactors: factor == null ? {} : { 5: factor },
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
        anchorUnitIds: { 2: 3 },
        anchorFactors: { 2: null },
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
        anchorUnitIds: { 5: 2 },
        anchorFactors: { 5: 50 },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "base_unit_not_selected",
  );
});

test("manual factors cannot bypass known dimension compatibility", () => {
  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [2, 3],
        baseUnitId: 3,
        anchorUnitIds: { 2: 3 },
        anchorFactors: { 2: 1000 },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "standard_unit_dimension_mismatch",
  );

  assert.equal(
    deriveEffectiveUnitFactor(
      {
        unitIds: [7, 6, 3],
        baseUnitId: 3,
        anchorUnitIds: { 7: 6, 6: 3 },
        anchorFactors: { 7: 24, 6: 250 },
        unitOptions: units,
      },
      7,
    ),
    6000,
  );
});

test("standard dimensions remain consistent across custom-unit bridges", () => {
  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [2, 6, 3],
        baseUnitId: 3,
        anchorUnitIds: { 2: 6, 6: 3 },
        anchorFactors: { 2: 4, 6: 250 },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "standard_unit_dimension_mismatch",
  );

  const sameDimension = buildCatalogUnits({
    unitIds: [2, 6, 1],
    baseUnitId: 1,
    anchorUnitIds: { 2: 6, 6: 1 },
    anchorFactors: { 2: 10, 6: 100 },
    unitOptions: units,
  });
  assert.equal(
    sameDimension.find((row) => row.unit_id === 2)?.to_base_factor,
    1000,
  );

  const allCustom = buildCatalogUnits({
    unitIds: [7, 6, 5],
    baseUnitId: 5,
    anchorUnitIds: { 7: 6, 6: 5 },
    anchorFactors: { 7: 24, 6: 250 },
    unitOptions: units,
  });
  assert.equal(
    allCustom.find((row) => row.unit_id === 7)?.to_base_factor,
    6000,
  );
});

test("database numeric domains reject rounding, underflow, overflow and JSON null", () => {
  assert.equal(isValidAnchorFactor("999999999"), true);
  assert.equal(isValidAnchorFactor("1000000000"), false);
  assert.equal(isValidAnchorFactor("0.1234567891"), false);
  assert.equal(isValidAnchorFactor("0.000000001"), true);
  assert.equal(isValidAnchorFactor("0.0000000001"), false);
  assert.equal(isValidEffectiveFactor("999999"), true);
  assert.equal(isValidEffectiveFactor("1000000"), false);
  assert.equal(isValidEffectiveFactor(null), false);
  assert.equal(isValidEffectiveFactor(Number.POSITIVE_INFINITY), false);
});

test("raw anchor strings are validated before unsafe Number conversion", () => {
  const unsafeFactor = "900719925.474099199";
  assert.equal(isValidAnchorFactor(unsafeFactor), false);
  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [5, 3],
        baseUnitId: 3,
        anchorUnitIds: { 5: 3 },
        anchorFactors: { 5: unsafeFactor },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "anchor_factor_out_of_range",
  );
});

test("manual anchors and multi-hop effective factors fail before database rounding", () => {
  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [5, 3],
        baseUnitId: 3,
        anchorUnitIds: { 5: 3 },
        anchorFactors: { 5: 0.1234567891 },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "anchor_factor_out_of_range",
  );

  assert.throws(
    () =>
      buildCatalogUnits({
        unitIds: [7, 6, 5, 3],
        baseUnitId: 3,
        anchorUnitIds: { 7: 6, 6: 5, 5: 3 },
        anchorFactors: { 7: 999, 6: 999, 5: 999 },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "effective_factor_out_of_range",
  );
});

test("stored anchors survive a form round trip", () => {
  const model = readCatalogUnitModel(
    [
      {
        unit_id: 7,
        to_base_factor: 6000,
        is_base: false,
        anchor_unit_id: 6,
        anchor_factor: 24,
      },
      {
        unit_id: 6,
        to_base_factor: 250,
        is_base: false,
        anchor_unit_id: 3,
        anchor_factor: 250,
      },
      {
        unit_id: 3,
        to_base_factor: 1,
        is_base: true,
        anchor_unit_id: null,
        anchor_factor: null,
      },
    ],
    3,
    units,
  );

  assert.equal(model.baseUnitId, 3);
  assert.deepEqual(model.anchorUnitIds, { 7: 6, 6: 3, 3: null });
  assert.deepEqual(model.anchorFactors, { 7: 24, 6: 250, 3: null });
});

test("self anchors and multi-hop cycles fail closed", () => {
  for (const anchorUnitIds of [{ 7: 7, 6: 3 }, { 7: 6, 6: 7 }]) {
    assert.throws(
      () =>
        buildCatalogUnits({
          unitIds: [7, 6, 3],
          baseUnitId: 3,
          anchorUnitIds,
          anchorFactors: { 7: 24, 6: 250 },
          unitOptions: units,
        }),
      (error: unknown) =>
        error instanceof IngredientUnitModelError &&
        error.message === "unit_anchor_cycle",
    );
  }
});

test("removal reports direct dependents", () => {
  assert.deepEqual(findDirectDependents({ 7: 6, 6: 3 }, 6), [7]);
  assert.deepEqual(findDirectDependents({ 7: 6, 6: 3 }, 7), []);
});

test("cycle preview rejects an anchor that reaches the edited unit", () => {
  const anchorUnitIds = { 7: 6, 6: 3 };
  assert.equal(wouldCreateUnitCycle(anchorUnitIds, 6, 7), true);
  assert.equal(wouldCreateUnitCycle(anchorUnitIds, 7, 3), false);
});

test("one incomplete unrelated row does not hide a valid preview", () => {
  const factor = deriveEffectiveUnitFactor(
    {
      unitIds: [7, 6, 5, 3],
      baseUnitId: 3,
      anchorUnitIds: { 7: 6, 6: 3, 5: null },
      anchorFactors: { 7: 24, 6: 250, 5: null },
      unitOptions: units,
    },
    7,
  );
  assert.equal(factor, 6000);
});

test("changing the base preserves physical ratios and safe edges", () => {
  const result = rebaseUnitRelations({
    unitIds: [7, 6, 3],
    oldBaseUnitId: 3,
    newBaseUnitId: 6,
    anchorUnitIds: { 7: 6, 6: 3, 3: null },
    anchorFactors: { 7: 24, 6: 250, 3: null },
    unitOptions: units,
  });

  assert.deepEqual(result.anchorUnitIds, { 7: 6, 6: null, 3: 6 });
  assert.equal(result.anchorFactors[7], 24);
  assert.equal(result.anchorFactors[6], null);
  assert.equal(result.anchorFactors[3], 0.004);
});

test("rebasing preserves manual standard-unit ratios that differ from the registry", () => {
  const original = {
    unitIds: [1, 2, 5],
    baseUnitId: 5,
    anchorUnitIds: { 1: 5, 2: 5, 5: null },
    anchorFactors: { 1: 2, 2: 1000, 5: null },
    unitOptions: units,
  };
  const oldEffective = deriveEffectiveUnitFactors(original);
  const rebased = rebaseUnitRelations({
    ...original,
    oldBaseUnitId: 5,
    newBaseUnitId: 2,
  });
  const newEffective = deriveEffectiveUnitFactors({
    unitIds: original.unitIds,
    baseUnitId: 2,
    ...rebased,
    unitOptions: units,
  });

  assert.equal(rebased.anchorFactors[1], 0.002);
  assert.equal(newEffective[1]! / newEffective[2]!, oldEffective[1]! / oldEffective[2]!);
  assert.equal(newEffective[5]! / newEffective[2]!, oldEffective[5]! / oldEffective[2]!);
});

test("rebasing rejects a very small inverse that cannot fit anchor precision", () => {
  assert.throws(
    () =>
      rebaseUnitRelations({
        unitIds: [5, 6],
        oldBaseUnitId: 5,
        newBaseUnitId: 6,
        anchorUnitIds: { 5: null, 6: 5 },
        anchorFactors: { 5: null, 6: 999999 },
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "anchor_factor_out_of_range",
  );
});

test("rebasing does not collapse valid nine-decimal differences to an automatic factor", () => {
  for (const factor of [999.999999999, 1000.000000001]) {
    const rebased = rebaseUnitRelations({
      unitIds: [2, 1, 5],
      oldBaseUnitId: 5,
      newBaseUnitId: 1,
      anchorUnitIds: { 2: 5, 1: 5, 5: null },
      anchorFactors: { 2: factor, 1: 1, 5: null },
      unitOptions: units,
    });
    assert.equal(rebased.anchorFactors[2], factor);
  }
});

test("rebasing normalizes only genuine floating-point artifacts to automatic standard factors", () => {
  const rebased = rebaseUnitRelations({
    unitIds: [2, 1, 6, 5],
    oldBaseUnitId: 5,
    newBaseUnitId: 1,
    anchorUnitIds: { 2: 6, 1: 5, 6: 5, 5: null },
    anchorFactors: { 2: 0.2, 1: 0.00002, 6: 0.1, 5: null },
    unitOptions: units,
  });
  assert.equal(rebased.anchorFactors[2], null);
});

test("rebasing validates the complete generated graph before returning", () => {
  const anchorUnitIds = { 2: 6, 6: 3, 3: null };
  const anchorFactors = { 2: 4, 6: 250, 3: null };
  const beforeAnchors = structuredClone(anchorUnitIds);
  const beforeFactors = structuredClone(anchorFactors);

  assert.throws(
    () =>
      rebaseUnitRelations({
        unitIds: [2, 6, 3],
        oldBaseUnitId: 3,
        newBaseUnitId: 2,
        anchorUnitIds,
        anchorFactors,
        unitOptions: units,
      }),
    (error: unknown) =>
      error instanceof IngredientUnitModelError &&
      error.message === "standard_unit_dimension_mismatch",
  );
  assert.deepEqual(anchorUnitIds, beforeAnchors);
  assert.deepEqual(anchorFactors, beforeFactors);
});
