import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { getRecipeLineBaseQuantity } from "../app/(protected)/inventory/_lib/recipe-cost";
import type { IngredientUnitRow } from "../lib/inventory/types";

const repoRoot = resolve(process.cwd(), "../..");

function unit(row: Partial<IngredientUnitRow>): IngredientUnitRow {
  return {
    id: 0,
    unit_id: 0,
    unit_code: "",
    to_base_factor: 1,
    is_base: false,
    is_active: true,
    sort_order: 0,
    ...row,
  };
}

test("recipe display cost quantity follows inventory base-unit conversion", () => {
  const units = [
    unit({ unit_id: 1, unit_code: "g", to_base_factor: 1, is_base: true }),
    unit({ unit_id: 2, unit_code: "kg", to_base_factor: 1000 }),
  ];

  assert.equal(
    getRecipeLineBaseQuantity({
      quantity: 2,
      yieldFactor: 1,
      entryUnitId: 2,
      units,
    }),
    2000,
  );
});

test("recipe display cost quantity applies yield factor before costing", () => {
  assert.equal(
    getRecipeLineBaseQuantity({
      quantity: 2,
      yieldFactor: 0.8,
      entryUnitId: null,
    }),
    2.5,
  );
});

test("recipe display cost quantity keeps unitless lines unchanged", () => {
  assert.equal(
    getRecipeLineBaseQuantity({
      quantity: 3,
      yieldFactor: 1,
      entryUnitId: null,
    }),
    3,
  );
});

test("recipe display WAC uses active stock-bearing locations", () => {
  const source = readFileSync(
    resolve(
      repoRoot,
      "apps/web/app/(protected)/inventory/recipe-actions.ts",
    ),
    "utf8",
  );

  assert.match(source, /fetchStockBearingLocationIds/);
  assert.match(source, /\.in\("location_id", stockBearingLocationIds\)/);
});
