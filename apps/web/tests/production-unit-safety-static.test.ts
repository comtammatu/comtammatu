import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, `missing pg_dump object: ${createPrefix}`);
  const end = source.indexOf("\n\n--\n-- Name:", start + createPrefix.length);
  assert.notEqual(end, -1, `unterminated pg_dump object: ${createPrefix}`);
  return source.slice(start, end);
}

const prodBaseline = read(
  "supabase/migrations/00000000000000_baseline.sql",
);
const historicalRecipeUnitRepair = read(
  "supabase/migration-archive/20260710012357_production_recipe_unit_repair.sql",
);
const confirmProductionRunRpc = readPgDumpObject(
  prodBaseline,
  "CREATE FUNCTION public.confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_ingredients jsonb DEFAULT NULL::jsonb)",
);
const runActions = read(
  "apps/web/app/(protected)/inventory/production-run-actions.ts",
);
const newClient = read(
  "apps/web/app/(protected)/inventory/production/new/production-new-client.tsx",
);
const detailClient = read(
  "apps/web/app/(protected)/inventory/production/[id]/production-detail-client.tsx",
);
const branchDetailPage = read(
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx",
);

test("production confirmation converts the selected output unit before deriving BOM usage", () => {
  assert.match(
    confirmProductionRunRpc,
    /v_planned_output_base := ROUND\(\s*public\.inv_to_base\(\s*v_run\.finished_good_id,\s*v_run\.entry_unit_id,\s*v_run\.planned_quantity/s,
  );
  assert.match(
    confirmProductionRunRpc,
    /v_raw_need_measure :=\s*\(v_planned_output_base \* v_recipe\.quantity\)/s,
  );
  assert.doesNotMatch(
    confirmProductionRunRpc,
    /v_raw_need_measure :=\s*\(v_run\.planned_quantity \* v_recipe\.quantity\)/s,
  );
});

test("production recipe unit mappings are fail-closed and repaired only from the standard g-to-kg relation", () => {
  assert.match(prodBaseline, /CREATE TRIGGER production_recipes_entry_unit_guard/);
  assert.match(confirmProductionRunRpc, /production_recipe_unit_mapping_missing/);
  assert.match(confirmProductionRunRpc, /production_run_unit_mapping_review_required/);
  assert.doesNotMatch(confirmProductionRunRpc, /COALESCE\(to_base_factor, 1\.0\)/);
  assert.match(historicalRecipeUnitRepair, /entry_u\.code <> 'g'/);
  assert.match(historicalRecipeUnitRepair, /base_u\.code <> 'kg'/);
  assert.match(
    historicalRecipeUnitRepair,
    /entry_u\.standard_factor \/ base_u\.standard_factor AS to_base_factor/,
  );
  assert.match(
    prodBaseline,
    /FOREIGN KEY \(ingredient_id, entry_unit_id, tenant_id\)\s+REFERENCES public\.ingredient_units\(ingredient_id, unit_id, tenant_id\)/s,
  );
  assert.doesNotMatch(
    historicalRecipeUnitRepair,
    /production_run_review_required_before_unit_repair/,
  );
});

test("production UI and actions use base output quantities and surface the review guard", () => {
  assert.match(runActions, /production_run_unit_mapping_review_required/);
  assert.match(runActions, /is not valid for ingredient/);
  assert.match(runActions, /entry_unit_not_found/);
  assert.match(runActions, /entry_unit_to_base_factor/);
  assert.match(newClient, /productionQuantityToBase/);
  assert.match(
    newClient,
    /plannedOutputBaseQuantity \* ing\.default_usage_per_fg/,
  );
  assert.match(
    newClient,
    /disabled=\{isPending \|\| !canCreateProductionRun\}/,
  );
  assert.match(detailClient, /productionQuantityToBase/);
  assert.match(
    detailClient,
    /plannedOutputBaseQuantity \* ing\.default_usage_per_fg/,
  );
  assert.match(detailClient, /recipeContextError/);
  assert.match(detailClient, /actionError/);
  assert.match(detailClient, /Thao tác không thành công/);
  assert.match(branchDetailPage, /run\.source_location_id \?\? undefined/);
  assert.match(branchDetailPage, /recipeContextError=\{recipeContextError\}/);
});
