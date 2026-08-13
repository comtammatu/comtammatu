import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

function readSourceFiles(
  root: string,
): Array<{ path: string; source: string }> {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [{ path, source: read(path) }];
  });
}

test("inventory quantity inputs allow three fraction digits", () => {
  const adjustStock = read(
    "app/(protected)/inventory/stock/adjust-stock-dialog.tsx",
  );
  assert.match(
    adjustStock,
    /name="quantity_change"[\s\S]*maxFractionDigits=\{3\}/,
  );

  const productionDetail = read(
    "app/(protected)/inventory/production/[id]/production-detail-client.tsx",
  );
  assert.match(
    productionDetail,
    /QuantityInput[\s\S]*aria-label="Số lượng thực tế"[\s\S]*maxFractionDigits=\{3\}/,
  );

  const productionNew = read(
    "app/(protected)/inventory/production/production-create-dialog.tsx",
  );
  assert.match(
    productionNew,
    /QuantityInput[\s\S]*id="production-planned-quantity"[\s\S]*maxFractionDigits=\{3\}/,
  );

  const ingredientDialog = read(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  assert.doesNotMatch(
    ingredientDialog,
    /name="(?:min_stock_level|max_stock_level|reorder_point)"[\s\S]{0,160}maxFractionDigits=\{2\}/,
  );
});

test("inventory factor precision follows separate anchor and effective domains", () => {
  const ingredientDialog = read(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  const ingredientModel = read(
    "app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts",
  );
  const ingredientActions = read(
    "app/(protected)/inventory/ingredient-actions.ts",
  );

  assert.match(
    ingredientDialog,
    /maxFractionDigits=\{9\}/,
  );
  assert.match(ingredientDialog, /isValidAnchorFactor/);
  assert.match(ingredientModel, /const ANCHOR_SCALE = 9/);
  assert.match(ingredientModel, /const EFFECTIVE_SCALE = 12/);
  assert.match(ingredientActions, /anchorUnitFactorSchema[\s\S]*isValidAnchorFactor/);
  assert.match(
    ingredientActions,
    /effectiveUnitFactorSchema[\s\S]*isValidEffectiveFactor/,
  );

  const assertUnitRowSchemaWiring = (source: string) => {
    assert.match(
      source,
      /const unitRowSchema = z\.object\(\{[\s\S]*to_base_factor: effectiveUnitFactorSchema,[\s\S]*anchor_factor: anchorUnitFactorSchema\.nullable\(\)\.optional\(\),[\s\S]*\}\)/,
    );
  };
  assertUnitRowSchemaWiring(ingredientActions);

  const swappedSchemas = ingredientActions
    .replace(
      "to_base_factor: effectiveUnitFactorSchema",
      "to_base_factor: __swappedFactorSchema",
    )
    .replace(
      "anchor_factor: anchorUnitFactorSchema",
      "anchor_factor: effectiveUnitFactorSchema",
    )
    .replace("__swappedFactorSchema", "anchorUnitFactorSchema");
  assert.throws(() => assertUnitRowSchemaWiring(swappedSchemas));
});

test("inventory numeric entry points do not reintroduce two-decimal caps", () => {
  const files = readSourceFiles("app/(protected)/inventory");
  for (const file of files) {
    assert.doesNotMatch(
      file.source,
      /maxFractionDigits=\{2\}/,
      `${file.path} must not cap inventory numeric input precision at 2`,
    );
    assert.doesNotMatch(
      file.source,
      /step="0\.01"/,
      `${file.path} must not cap native number input precision at 0.01`,
    );
    assert.doesNotMatch(
      file.source,
      /type="number"/,
      `${file.path} must use shared formatted numeric inputs`,
    );
  }
});
