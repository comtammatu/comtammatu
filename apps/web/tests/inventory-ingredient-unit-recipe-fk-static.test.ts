import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const baseline = readRepo("supabase/migrations/00000000000000_baseline.sql");
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
  const replaceStart = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.bulk_import_ingredients",
  );
  const createStart = source.indexOf(
    "CREATE FUNCTION public.bulk_import_ingredients",
  );
  const start = replaceStart !== -1 ? replaceStart : createStart;
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

test("current catalog RPCs sync ingredient_units instead of delete-all", () => {
  const upsertBody = extractUpsertBody(baseline);
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

  const bulkBody = extractBulkImportBody(baseline);
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
    baseline,
    /REVOKE ALL ON FUNCTION public\.upsert_ingredient_catalog\([^;]+\) FROM PUBLIC/,
  );
  assert.match(
    baseline,
    /GRANT ALL ON FUNCTION public\.upsert_ingredient_catalog\([^;]+\) TO authenticated/,
  );
  assert.match(
    baseline,
    /REVOKE ALL ON FUNCTION public\.bulk_import_ingredients\([^;]+\) FROM PUBLIC/,
  );
  assert.match(
    baseline,
    /GRANT ALL ON FUNCTION public\.bulk_import_ingredients\([^;]+\) TO authenticated/,
  );
});

test("current schema retains the live lot and expiry contract", () => {
  const grnItems =
    baseline.match(/CREATE TABLE public\.grn_items \([\s\S]*?\n\);/)?.[0] ??
    "";
  const ingredients =
    baseline.match(/CREATE TABLE public\.ingredients \([\s\S]*?\n\);/)?.[0] ??
    "";
  assert.notEqual(grnItems, "");
  assert.notEqual(ingredients, "");
  assert.match(grnItems, /\bexpiry_date date/);
  assert.match(grnItems, /\bbatch_number text/);
  assert.match(ingredients, /\bshelf_life_days integer/);
  assert.match(
    baseline,
    /CREATE MATERIALIZED VIEW public\.mv_inventory_stock_current AS/,
  );
  assert.match(
    baseline,
    /CREATE MATERIALIZED VIEW public\.mv_inventory_value_ranking AS/,
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
