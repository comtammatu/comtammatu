import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const forwardMigration = readRepo(
  "supabase/migrations/20260710193250_upsert_ingredient_units_preserve_recipe_fk.sql",
);
const lotExpiryMigration = readRepo(
  "supabase/migrations/20260710193300_retire_lot_expiry_columns.sql",
);
const ingredientActions = readRepo(
  "apps/web/app/(protected)/inventory/ingredient-actions.ts",
);

function extractUpsertBody(source: string): string {
  const replaceStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.upsert_ingredient_catalog",
  );
  const createStart = source.indexOf(
    "CREATE FUNCTION public.upsert_ingredient_catalog",
  );
  const from =
    replaceStart !== -1
      ? replaceStart
      : createStart !== -1
        ? createStart
        : -1;
  assert.notEqual(from, -1, "missing upsert_ingredient_catalog");
  const marker = "LANGUAGE plpgsql";
  const lang = source.indexOf(marker, from);
  assert.notEqual(lang, -1);
  const nextCreate = source.indexOf("\nCREATE ", lang + marker.length);
  const nextRevoke = source.indexOf("\nREVOKE ", lang + marker.length);
  const nextCommit = source.indexOf("\nCOMMIT;", lang + marker.length);
  const ends = [nextCreate, nextRevoke, nextCommit].filter((i) => i !== -1);
  const end = ends.length > 0 ? Math.min(...ends) : source.length;
  return source.slice(from, end);
}

function extractBulkImportBody(source: string): string {
  const start = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.bulk_import_ingredients",
  );
  assert.notEqual(start, -1, "missing bulk_import_ingredients");
  const revoke = source.indexOf(
    "REVOKE ALL ON FUNCTION public.bulk_import_ingredients",
    start,
  );
  const commit = source.indexOf("\nCOMMIT;", start);
  const end =
    revoke !== -1 ? revoke : commit !== -1 ? commit : source.length;
  return source.slice(start, end);
}

const bareDeleteAll =
  /DELETE FROM public\.ingredient_units WHERE ingredient_id = v_id AND tenant_id = v_tenant\s*;/;

test("forward migration syncs ingredient_units instead of delete-all", () => {
  assert.ok(
    "20260710193250_upsert_ingredient_units_preserve_recipe_fk.sql" <
      "20260710193300_retire_lot_expiry_columns.sql",
    "FK hotfix must sort before lot/expiry signature drop",
  );

  const upsertBody = extractUpsertBody(forwardMigration);
  assert.doesNotMatch(upsertBody, bareDeleteAll);
  assert.match(
    upsertBody,
    /ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key/,
  );
  assert.match(upsertBody, /ingredient_unit_in_use_by_production_recipe/);
  assert.match(
    upsertBody,
    /DELETE FROM public\.ingredient_units iu[\s\S]*NOT EXISTS/,
  );

  const bulkBody = extractBulkImportBody(forwardMigration);
  assert.doesNotMatch(
    bulkBody,
    /DELETE FROM public\.ingredient_units ingredient_units/,
  );
  assert.match(
    bulkBody,
    /ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key/,
  );
  assert.match(bulkBody, /bulk_import_base_unit_change_forbidden/);

  assert.match(
    forwardMigration,
    /REVOKE ALL ON FUNCTION public\.upsert_ingredient_catalog\(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, integer, jsonb\) FROM PUBLIC/,
  );
  assert.match(
    forwardMigration,
    /GRANT ALL ON FUNCTION public\.upsert_ingredient_catalog\(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, integer, jsonb\) TO authenticated/,
  );
  assert.match(
    forwardMigration,
    /REVOKE ALL ON FUNCTION public\.bulk_import_ingredients\(p_rows jsonb\) FROM PUBLIC/,
  );
  assert.match(
    forwardMigration,
    /GRANT ALL ON FUNCTION public\.bulk_import_ingredients\(p_rows jsonb\) TO authenticated/,
  );
});

test("lot/expiry retirement migration keeps recipe-safe unit sync", () => {
  const upsertBody = extractUpsertBody(lotExpiryMigration);
  assert.doesNotMatch(upsertBody, bareDeleteAll);
  assert.match(
    upsertBody,
    /ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key/,
  );
  assert.match(upsertBody, /ingredient_unit_in_use_by_production_recipe/);

  const bulkBody = extractBulkImportBody(lotExpiryMigration);
  assert.doesNotMatch(
    bulkBody,
    /DELETE FROM public\.ingredient_units ingredient_units/,
  );
  assert.match(bulkBody, /bulk_import_base_unit_change_forbidden/);
});

test("lot/expiry retirement rebuilds materialized views in dependency order", () => {
  const dropValueRanking = lotExpiryMigration.indexOf(
    "DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_value_ranking;",
  );
  const dropStockCurrent = lotExpiryMigration.indexOf(
    "DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_stock_current;",
  );
  const createStockCurrent = lotExpiryMigration.indexOf(
    "CREATE MATERIALIZED VIEW public.mv_inventory_stock_current AS",
  );
  const createValueRanking = lotExpiryMigration.indexOf(
    "CREATE MATERIALIZED VIEW public.mv_inventory_value_ranking AS",
  );

  assert.ok(dropValueRanking >= 0);
  assert.ok(dropValueRanking < dropStockCurrent);
  assert.ok(dropStockCurrent < createStockCurrent);
  assert.ok(createStockCurrent < createValueRanking);
  assert.equal(
    [...lotExpiryMigration.matchAll(/CREATE MATERIALIZED VIEW public\.mv_inventory_value_ranking AS/g)]
      .length,
    1,
  );
  assert.match(
    lotExpiryMigration,
    /CREATE UNIQUE INDEX uq_mv_inv_value_ranking\s+ON public\.mv_inventory_value_ranking/,
  );
  assert.match(
    lotExpiryMigration,
    /GRANT ALL ON TABLE public\.mv_inventory_value_ranking TO service_role/,
  );
  assert.match(
    lotExpiryMigration,
    /REFRESH MATERIALIZED VIEW public\.mv_inventory_value_ranking/,
  );
});

test("catalog error map distinguishes recipe-in-use from unit/category FK", () => {
  assert.match(
    ingredientActions,
    /ingredient_unit_in_use_by_production_recipe/,
  );
  assert.match(
    ingredientActions,
    /production_recipes_ingredient_entry_unit_fkey/,
  );
  assert.match(
    ingredientActions,
    /Đơn vị đang dùng trong công thức sản xuất/,
  );
  assert.match(ingredientActions, /unit not found/);
  assert.match(ingredientActions, /category not found/);
  assert.match(ingredientActions, /Nhóm nguyên liệu không hợp lệ/);
  assert.match(ingredientActions, /bulk_import_base_unit_change_forbidden/);
});
