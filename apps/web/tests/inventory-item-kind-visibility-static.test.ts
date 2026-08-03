import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ingredientsClientSource = readWeb(
  "app/(protected)/inventory/ingredients/ingredients-client.tsx",
);
const ingredientDialogSource = readWeb(
  "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
);
const stockClientSource = readWeb(
  "app/(protected)/inventory/stock/stock-client.tsx",
);
const branchStockClientSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
);

test("inventory ingredients list exposes item kind visibly and as a filter", () => {
  assert.match(ingredientsClientSource, /ITEM_KIND_LABELS/);
  assert.match(ingredientsClientSource, /ITEM_KIND_OPTIONS/);
  assert.match(ingredientsClientSource, /const \[itemKind, setItemKind\]/);
  assert.match(ingredientsClientSource, /item\.item_kind === itemKind/);
  assert.match(ingredientsClientSource, /itemKindLabel\(item\)/);
});

test("inventory ingredients table separates classification and thresholds columns", () => {
  assert.match(ingredientsClientSource, /key: "classification"/);
  assert.match(
    ingredientsClientSource,
    /messages\.inventory\.stock\.table\.kind/,
  );
  assert.match(ingredientsClientSource, /key: "thresholds"/);
  assert.match(ingredientsClientSource, /key: "unit_cost"/);
});

test("inventory ingredients filters expose search metadata and reset action", () => {
  assert.match(ingredientsClientSource, /name="ingredient-search"/);
  assert.match(ingredientsClientSource, /inputMode="search"/);
  assert.match(ingredientsClientSource, /const hasActiveFilters =/);
  assert.match(ingredientsClientSource, /function clearFilters\(\)/);
  assert.match(ingredientsClientSource, /ACTIONS_VI\.clearFilters/);
});

test("ingredient form models active units around one explicit standard unit", () => {
  assert.match(ingredientDialogSource, /unit_ids: z/);
  assert.doesNotMatch(ingredientDialogSource, /name="production_unit_id"/);
  assert.match(ingredientDialogSource, /name: "base_unit_id"/);
  assert.match(ingredientDialogSource, /selectedUnitIds\.map/);
  assert.match(ingredientDialogSource, /<UnitFactorField/);
  assert.doesNotMatch(ingredientDialogSource, /productionEnabled \?/);
  assert.doesNotMatch(
    ingredientDialogSource,
    /input_to_output_factor|input_unit_is_different/,
  );
  assert.doesNotMatch(
    ingredientDialogSource,
    /unitsLocked|fetchIngredientUnitLock/,
  );
  assert.doesNotMatch(
    ingredientDialogSource,
    /makeSecondaryRow|previewCanonical|anchor_input_direction/,
  );
});

test("inventory stock responsive cards label item kind separately from category", () => {
  assert.match(stockClientSource, /ITEM_KIND_LABELS/);
  assert.match(stockClientSource, /StockCategoryKindCell/);
  assert.match(
    stockClientSource,
    /ITEM_KIND_LABELS\[item\.itemKind\] \?\? UNKNOWN_LABEL_VI/,
  );
  assert.match(stockClientSource, /CATEGORY_TONE_CLASS/);
  assert.match(branchStockClientSource, /ITEM_KIND_LABELS/);
  assert.match(
    branchStockClientSource,
    /ITEM_KIND_LABELS\[item\.itemKind\] \?\? UNKNOWN_LABEL_VI/,
  );
});
