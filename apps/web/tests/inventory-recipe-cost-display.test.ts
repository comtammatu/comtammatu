import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getMenuRecipeLineBaseQuantity } from "../app/(protected)/inventory/_lib/menu-recipe-cost";
import type { IngredientUnitRow } from "../lib/inventory/types";

const recipeActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/menu-recipe-actions.ts"),
  "utf8",
);
const recipesPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/menu-recipes/page.tsx"),
  "utf8",
);
const recipeDialogSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
  ),
  "utf8",
);

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
    getMenuRecipeLineBaseQuantity({
      quantity: 2,
      entryUnitId: 2,
      units,
    }),
    2000,
  );
});

test("recipe display cost quantity keeps unitless lines unchanged", () => {
  assert.equal(
    getMenuRecipeLineBaseQuantity({
      quantity: 3,
      entryUnitId: null,
    }),
    3,
  );
});

test("menu recipes use the ingredient output unit for quantity and writes", () => {
  assert.match(recipesPageSource, /qty: outputQuantity/);
  assert.match(recipesPageSource, /entryUnitId: outputUnitId/);
  assert.doesNotMatch(recipeDialogSource, /\bunitEditable\b/);
  assert.match(recipeActionsSource, /\.eq\("is_base", true\)/);
  assert.match(
    recipeActionsSource,
    /entry_unit_id: outputUnitByIngredient\.get\(line\.ingredientId\)/,
  );
});

test("recipe WAC reads only active stock-bearing locations", () => {
  assert.match(recipeActionsSource, /fetchStockBearingLocationIds/);
  assert.match(
    recipeActionsSource,
    /\.in\("location_id", stockBearingLocations\.locationIds\)/,
  );
  assert.doesNotMatch(recipeActionsSource, /branches\.branch_kind/);
});
