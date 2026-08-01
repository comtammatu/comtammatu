import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8");

const migration = readRepo(
  "supabase/migration-archive/20260706170000_inventory_unit_system_phase_a2_catalog_anchor.sql",
);
const unitLadderLockMigration = readRepo(
  "supabase/migration-archive/20260706024311_inventory_unit_ladder_lock_by_stock_movements.sql",
);
const ingredientActions = readRepo(
  "apps/web/app/(protected)/inventory/ingredient-actions.ts",
);
const ingredientDialog = readRepo(
  "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
);
const ingredientClient = readRepo(
  "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
);
const unitsActions = readRepo(
  "apps/web/app/(protected)/inventory/settings/units/units-actions.ts",
);

test("A2 redefines the catalog upsert to derive to_base_factor from anchors", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.upsert_ingredient_catalog\(/,
  );
  // The Phase A2 persisted factor and purchase_to_measure_factor migration
  // path both flow through the shared resolver for anchored rows.
  assert.match(
    migration,
    /public\.inv_catalog_unit_to_base\(v_base_unit_id, e, p_units\)/,
    "the ingredient_units INSERT must derive to_base_factor via the resolver",
  );
  assert.match(
    migration,
    /v_factor := 1\.0 \/ public\.inv_catalog_unit_to_base\(v_base_unit_id, v_secondary, p_units\)/,
    "purchase_to_measure_factor must use the derived secondary factor",
  );
});

test("A2 persists the anchor pair on ingredient_units", () => {
  assert.match(migration, /anchor_unit_id, anchor_factor,/);
  assert.match(migration, /nullif\(e->>'anchor_unit_id', ''\)::bigint/);
  assert.match(migration, /nullif\(e->>'anchor_factor', ''\)::numeric/);
});

test("A2 resolver derives anchored rows via the tenant-scoped Phase A helper", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.inv_catalog_unit_to_base\(/,
  );
  assert.match(migration, /LANGUAGE plpgsql STABLE/);
  assert.match(migration, /SET search_path TO ''/);
  // The resolver reads no tables itself; anchored rows delegate to
  // inv_derive_to_base_factor, which scopes tenant from auth_tenant_id().
  assert.match(
    migration,
    /RETURN public\.inv_derive_to_base_factor\(/,
    "anchored rows must derive through the Phase A helper",
  );
});

test("A2 resolver keeps a positive-guarded factor for anchorless rows", () => {
  // A non-base packaging row without an anchor keeps its client factor so the
  // currently-deployed dialog still saves during the apply -> deploy window.
  assert.match(
    migration,
    /RETURN coalesce\(\(p_unit->>'to_base_factor'\)::numeric, 1\)/,
  );
  assert.match(
    migration,
    /nullif\(e->>'anchor_unit_id', ''\) IS NULL\s+AND coalesce\(\(e->>'to_base_factor'\)::numeric, 0\) <= 0/,
    "the positive-factor guard must apply only to anchorless non-base rows",
  );
});

test("A2 locks the new resolver to authenticated/service_role and keeps the RPC grant", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\) TO authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.upsert_ingredient_catalog\([^)]*\) TO authenticated, service_role/,
  );
});

test("A2 historically locked unit ladders after movements; current catalog rebases instead", () => {
  const guardIndex = unitLadderLockMigration.indexOf(
    "inventory_unit_ladder_locked_by_stock_movements",
  );
  const replaceIndex = unitLadderLockMigration.indexOf(
    "DELETE FROM public.ingredient_units WHERE ingredient_id = v_id",
  );

  assert.ok(
    guardIndex > 0,
    "the archived Phase A2 upsert exposed a stable lock code",
  );
  assert.ok(
    replaceIndex > guardIndex,
    "the archived lock ran before replacing ingredient_units",
  );
});

test("current catalog save rebases base quantities and keeps the editor unlocked", () => {
  const rebaseMigration = readRepo(
    "supabase/migrations/20260731220433_catalog_unit_rebase_allow_edit.sql",
  );
  assert.match(rebaseMigration, /current_quantity = current_quantity \* v_scale/);
  assert.match(rebaseMigration, /avg_unit_cost = CASE/);
  assert.match(
    rebaseMigration,
    /UPDATE public\.inventory_valuation_accounts/,
  );
  assert.doesNotMatch(
    rebaseMigration,
    /inventory_standard_unit_locked_by_stock_movements/,
  );
  assert.doesNotMatch(
    rebaseMigration,
    /inventory_unit_ladder_locked_by_stock_movements/,
  );
  const rebaseJoinFix = readRepo(
    "supabase/migrations/20260731222809_catalog_unit_rebase_fix_draft_factor_join.sql",
  );
  assert.doesNotMatch(
    rebaseJoinFix,
    /JOIN public\.ingredient_units AS unit_row\s+ON[\s\S]*item\.entry_unit_id/,
  );
  assert.match(
    rebaseJoinFix,
    /FROM public\.purchase_orders AS po,\s+public\.ingredient_units AS unit_row,\s+public\.units AS units/,
  );
  assert.doesNotMatch(
    ingredientActions,
    /export async function fetchIngredientUnitLock/,
  );
  assert.doesNotMatch(ingredientDialog, /fetchIngredientUnitLock/);
  assert.doesNotMatch(ingredientDialog, /unitsLocked/);
  assert.doesNotMatch(ingredientClient, /fetchIngredientUnitLock/);
  assert.doesNotMatch(ingredientDialog, /useFieldArray|UnitsField/);
  assert.match(ingredientDialog, /name="input_unit_id"/);
  assert.match(ingredientDialog, /name="output_unit_id"/);
  assert.match(ingredientDialog, /name: "base_unit_id"/);
});

test("ingredient actions no longer surface movement-based unit locks", () => {
  assert.doesNotMatch(
    ingredientActions,
    /inventory_unit_ladder_locked_by_stock_movements/,
  );
  assert.doesNotMatch(
    ingredientActions,
    /inventory_standard_unit_locked_by_stock_movements/,
  );
  assert.match(
    ingredientActions,
    /mapCatalogRpcError\(error\.code, error\.message\)/,
  );
});

test("global units cannot be renamed after they are assigned", () => {
  assert.match(
    unitsActions,
    /\.select\("id", \{ count: "exact", head: true \}\)/,
  );
  assert.match(
    unitsActions,
    /\(mappingsResult\.count \?\? 0\) > 0[\s\S]*currentResult\.data\.code !== data\.code/,
  );
});
