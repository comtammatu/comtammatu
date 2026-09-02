import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("production recipe upsert migration allows finished goods and guards against circular dependency", () => {
  const migration = read(
    "supabase/migration-archive/20260827171422_allow_finished_goods_in_production_recipes.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.upsert_production_recipe_lines/);
  // Rejects self-reference
  assert.match(migration, /recipe_self_reference/);
  // Rejects transitive circular dependency via recursive CTE
  assert.match(migration, /WITH RECURSIVE dependency_chain AS/);
  assert.match(migration, /recipe_circular_dependency/);
  // Does NOT restrict ingredient to raw_material only
  assert.doesNotMatch(
    migration,
    /ingredient\.item_kind = 'raw_material'/,
    "Migration must not restrict recipe ingredients to raw_material only",
  );
});

test("production recipe actions map cycle and self-reference errors and allow all active ingredients", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  );

  assert.match(actions, /recipe_self_reference/);
  assert.match(actions, /recipe_circular_dependency/);
  assert.match(actions, /Thành phẩm không thể dùng chính nó làm nguyên liệu/);
  assert.match(actions, /Công thức có vòng lặp phụ thuộc/);
  // Import uses ingredientByName containing all active ingredients
  assert.match(actions, /const ingredientByName = new Map/);
  assert.doesNotMatch(
    actions,
    /rawIngredientByName/,
    "Import must not restrict recipe ingredients to rawIngredientByName",
  );
});

test("production recipe panel provides all ingredients to lines editor excluding the edited finished good", () => {
  const panel = read(
    "apps/web/app/(protected)/inventory/production-recipe-panel.tsx",
  );

  assert.match(panel, /availableIngredientsOptions/);
  assert.match(panel, /availableLinesEditorIngredients/);
  assert.match(panel, /String\(item\.id\) !== selectedFinishedGoodId/);
  assert.doesNotMatch(
    panel,
    /rawIngredientsOptions/,
    "Panel must not restrict line editor to rawIngredientsOptions",
  );
});
