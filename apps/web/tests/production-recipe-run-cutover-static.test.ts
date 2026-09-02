import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readSql(root, path);

const migration = read(
  "supabase/migrations/20260801171412_production_recipe_unit_workflow_cutover.sql",
);
const recipeActions = read(
  "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
);
const runActions = read(
  "apps/web/app/(protected)/inventory/production-run-actions.ts",
);
const newClient = read(
  "apps/web/app/(protected)/inventory/production/production-create-dialog.tsx",
);
const detailClient = read(
  "apps/web/app/(protected)/inventory/production/[id]/production-detail-client.tsx",
);
const catalogAction = read(
  "apps/web/app/(protected)/inventory/ingredient-actions.ts",
);
const catalogDialog = read(
  "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
);
const recipePanel = read(
  "apps/web/app/(protected)/inventory/production-recipe-panel.tsx",
);
const ingredientLinesEditor = read(
  "apps/web/app/(protected)/inventory/_components/ingredient-lines-editor.tsx",
);

test("recipe header owns output unit and existing groups require review", () => {
  assertSqlMatch(migration, /CREATE TABLE public\.production_recipe_specs/);
  assertSqlMatch(migration, /status text NOT NULL DEFAULT 'needs_review'/);
  assertSqlMatch(migration, /'needs_review'\s+FROM public\.production_recipes/);
  assertSqlMatch(migration, /ADD COLUMN recipe_spec_id bigint/);
  assert.match(recipeActions, /outputUnitId: z\.coerce\.number\(\)\.int\(\)\.positive/);
  assert.match(recipeActions, /p_output_unit_id: data\.outputUnitId/);
});

test("recipe lines accept any active unit of the correct ingredient", () => {
  assertSqlMatch(migration, /ingredient_unit\.unit_id = v_entry_unit_id/);
  assertSqlMatch(migration, /ingredient_unit\.is_active IS TRUE/);
  assert.doesNotMatch(recipeActions, /production_unit_id/);
  assert.doesNotMatch(recipeActions, /inventory_unit_role_mismatch/);
});

test("recipe UI is list-first and keeps ingredient lines in the editor", () => {
  assert.match(recipePanel, /<AppListFrame/);
  assert.match(recipePanel, /data=\{filteredRecipes\}/);
  assert.match(recipePanel, /renderRowContextMenu=/);
  assert.match(recipePanel, /mobileCardRender=/);
  assert.match(recipePanel, /<IngredientLinesEditor/);
  assert.match(recipePanel, /unitEditable\s+bulkAdd/);
  assert.doesNotMatch(recipePanel, /key:\s*"ingredients"/);
  assert.doesNotMatch(
    recipePanel,
    /group\.lines\.map\(\(line\) =>/,
  );
  assert.doesNotMatch(recipePanel, /groupedRecipes\.map\(\(group\) =>/);
  assert.doesNotMatch(recipePanel, /<Item variant="outline" onClick=/);
  assert.match(
    recipePanel,
    /group\.status === "needs_review"[\s\S]*productionRecipeReview/,
  );
  assert.match(recipePanel, /reviewingRecipe[\s\S]*productionRecipeReviewSave/);
  assert.match(ingredientLinesEditor, /const watchedRows = useWatch/);
});

test("run creation snapshots the recipe and accepts no unit or target branch", () => {
  assertSqlMatch(migration, /CREATE TABLE public\.production_run_lines/);
  assertSqlMatch(migration, /p_planned_quantity \/ v_spec\.output_quantity/);
  assert.match(runActions, /recipeSpecId: z\.coerce\.number\(\)\.int\(\)\.positive/);
  assert.doesNotMatch(runActions, /targetBranchId|entryUnitId|ingredientsOverride/);
  assert.doesNotMatch(newClient, /actualIngredients|actual_quantity|entryUnitId/);
});

test("completion requires in-progress and posts only at central kitchen", () => {
  assertSqlMatch(migration, /v_run\.status <> 'in_progress'/);
  assertSqlMatch(migration, /branch\.branch_kind = 'central_kitchen'/);
  assertSqlMatch(migration, /v_run\.target_branch_id <> v_run\.branch_id/);
  assertSqlMatch(migration, /ORDER BY stock\.ingredient_id, stock\.location_id\s+FOR UPDATE/);
  assertSqlMatch(migration, /DETAIL = v_shortages::text/);
  assertSqlMatch(migration, /v_input_value \/ v_output_base/);
  assert.match(detailClient, /run\.status === "draft"/);
  assert.match(detailClient, /run\.status === "in_progress"/);
  assert.doesNotMatch(detailClient, /completeProductionRun\([\s\S]{0,500}run\.status === "draft"/);
});

test("catalog removes production unit while compatibility RPC receives null", () => {
  assert.doesNotMatch(catalogDialog, /production_unit_id|Đơn vị sản xuất/);
  assert.match(catalogAction, /p_production_unit_id: null/);
  assert.doesNotMatch(
    catalogAction.slice(0, catalogAction.indexOf("type SaveCatalogArgs")),
    /production_unit_id/,
  );
});

test("branch production routes only redirect to the canonical surface", () => {
  const list = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx",
  );
  const create = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx",
  );
  const detail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx",
  );
  assert.match(list, /redirect\(`\/inventory\/production\?branch=/);
  assert.match(create, /redirect\(`\/inventory\/production\?branch=/);
  assert.match(detail, /runId=\$\{encodeURIComponent\(id\)\}/);
  assert.match(detail, /mode=view/);
});
