import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runActionSource = readFileSync(
  "app/(protected)/inventory/production-run-actions.ts",
  "utf8",
);
const recipeActionSource = readFileSync(
  "app/(protected)/inventory/production-recipe-actions.ts",
  "utf8",
);
const productionDataSource = readFileSync(
  "app/(protected)/inventory/production-data.ts",
  "utf8",
);
const newPageSource = readFileSync(
  "app/(protected)/inventory/production/new/page.tsx",
  "utf8",
);

test("production run creation is backed by production recipes, not menu recipes", () => {
  assert.match(
    runActionSource,
    /\.from\("production_recipes"\)[\s\S]*\.eq\("finished_good_id", parsed\.finishedGoodId\)/,
  );
  assert.doesNotMatch(runActionSource, /\.from\("recipes"\)/);
  assert.doesNotMatch(runActionSource, /\.from\("menu_items"\)/);

  assert.match(newPageSource, /const recipeFinishedGoodIds = new Set/);
  assert.match(newPageSource, /const finishedGoodsWithRecipes = finishedGoods\.filter/);
  assert.match(newPageSource, /finishedGoods=\{finishedGoodsWithRecipes\}/);
});

test("production recipe tab reads production_recipes without the dropped unit column", () => {
  assert.match(recipeActionSource, /\.from\("production_recipes"\)/);
  assert.match(recipeActionSource, /entry_unit_id/);
  assert.doesNotMatch(recipeActionSource, /quantity,\s*unit,\s*entry_unit_id/);
  assert.doesNotMatch(recipeActionSource, /row\.unit/);
  assert.doesNotMatch(recipeActionSource, /ingredient\?\.unit/);
});

test("production recipe permissions are production-scoped instead of menu-only", () => {
  assert.match(
    recipeActionSource,
    /PRODUCTION_RECIPE_READ_PERMISSIONS[\s\S]*INVENTORY_PRODUCTION_CREATE[\s\S]*INVENTORY_PRODUCTION_CONFIRM/,
  );
  assert.match(
    recipeActionSource,
    /PRODUCTION_RECIPE_MANAGE_PERMISSIONS[\s\S]*INVENTORY_PRODUCTION_CREATE[\s\S]*INVENTORY_PRODUCTION_CONFIRM/,
  );
  assert.match(
    recipeActionSource,
    /anyPermission:\s*PRODUCTION_RECIPE_MANAGE_PERMISSIONS/,
  );
  assert.match(
    productionDataSource,
    /currentUserHasAnyPermissionAny\(PRODUCTION_RECIPE_MANAGE_PERMISSIONS\)/,
  );
});

test("production recipe UI pipes production_unit_id into entry_unit_id", () => {
  const panelSource = readFileSync(
    "app/(protected)/inventory/production-recipe-panel.tsx",
    "utf8",
  );
  const editorSource = readFileSync(
    "app/(protected)/inventory/_components/ingredient-lines-editor.tsx",
    "utf8",
  );
  const typesSource = readFileSync(
    "app/(protected)/inventory/production-types.ts",
    "utf8",
  );
  const quickCreateSource = readFileSync(
    "app/(protected)/inventory/ingredient-actions.ts",
    "utf8",
  );
  const quickCreateFn = quickCreateSource.slice(
    quickCreateSource.indexOf("export const quickCreateIngredient"),
    quickCreateSource.indexOf("export const quickCreateIngredient") + 4500,
  );

  assert.match(typesSource, /production_unit_id\?: number \| null/);
  assert.match(productionDataSource, /production_unit_id: ingredient\.production_unit_id/);
  assert.match(panelSource, /production_unit_id: item\.production_unit_id/);
  assert.match(panelSource, /getDefaultProductionUnit/);
  assert.match(editorSource, /production_unit_id\?: number \| null/);
  assert.match(editorSource, /missingProductionUnit/);
  assert.match(editorSource, /productionUnitMissingHint/);
  assert.match(
    editorSource,
    /missingProductionUnit && "rounded-md border border-destructive"/,
  );
  assert.doesNotMatch(
    editorSource,
    /missingProductionUnit[\s\S]{0,80}productionRecipeProductionUnitRequired/,
  );
  assert.doesNotMatch(
    editorSource,
    /defaultUnit\?\.label \?\? ing\?\.unitLabel|defaultUnit\?\.label \?\? ing\.unitLabel/,
  );
  assert.match(recipeActionSource, /inventory_unit_role_mismatch/);
  assert.match(recipeActionSource, /entryUnitId: z\.coerce\.number\(\)\.int\(\)\.positive/);
  assert.match(quickCreateFn, /production_unit_id: unitId/);
  assert.doesNotMatch(quickCreateFn, /production_unit_id: null/);
});

test("production recipe upsert uses output_quantity and omits yield_factor", () => {
  const panelSource = readFileSync(
    "app/(protected)/inventory/production-recipe-panel.tsx",
    "utf8",
  );

  assert.match(recipeActionSource, /outputQuantity: z\.coerce\.number\(\)\.positive/);
  assert.match(recipeActionSource, /p_output_quantity: data\.outputQuantity/);
  assert.match(recipeActionSource, /output_quantity,/);
  assert.doesNotMatch(recipeActionSource, /yieldFactor|yield_factor/);
  assert.match(panelSource, /name="output_quantity"/);
  assert.match(panelSource, /InputGroupAddon/);
  assert.match(panelSource, /finishedGoodUnitLabel/);
  assert.match(panelSource, /getDefaultProductionUnit/);
  assert.match(panelSource, /output_quantity: ""/);
  assert.doesNotMatch(panelSource, /productionRecipeOutputQuantityHint/);
  assert.doesNotMatch(panelSource, /yieldFactor:|yield_factor|showYield/);
});

test("production recipe ingredients accept raw_material only", () => {
  const panelSource = readFileSync(
    "app/(protected)/inventory/production-recipe-panel.tsx",
    "utf8",
  );
  const migrationSource = readFileSync(
    "../../supabase/migrations/20260801013626_production_recipe_ingredients_raw_material_only.sql",
    "utf8",
  );

  assert.match(
    panelSource,
    /filter\(\(ingredient\) => ingredient\.item_kind === "raw_material"\)/,
  );
  assert.doesNotMatch(
    panelSource,
    /item_kind === "raw_material" \|\|[\s\S]*item_kind === "finished_good"/,
  );
  assert.match(
    recipeActionSource,
    /if \(ingredient\.item_kind === "raw_material"\) \{\s*addNameLookup\(rawIngredientByName/,
  );
  assert.match(
    recipeActionSource,
    /if \(!ingredient \|\| ingredient\.item_kind !== "raw_material"\)/,
  );
  assert.doesNotMatch(
    recipeActionSource,
    /item_kind !== "raw_material" &&[\s\S]*item_kind !== "finished_good"/,
  );
  assert.match(migrationSource, /i\.item_kind = 'raw_material'/);
  assert.match(migrationSource, /ingredients\.item_kind = 'raw_material'/);
  assert.doesNotMatch(
    migrationSource,
    /item_kind IN \('raw_material', 'finished_good'\)/,
  );
});
