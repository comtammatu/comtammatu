import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, start);
  assert.notEqual(endIndex, -1, end);
  return source.slice(startIndex, endIndex);
}

test("WF-09 migration defines atomic bulk import RPC contracts", () => {
  const sql = read(
    "supabase/migrations/20260702105307_wf09_bulk_import_atomic.sql",
  );

  for (const fn of [
    "bulk_import_ingredients",
    "bulk_import_production_recipes",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`),
    );
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}`));
  }

  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /INSERT INTO public\.ingredients/);
  assert.match(sql, /INSERT INTO public\.ingredient_units/);
  assert.match(sql, /INSERT INTO public\.production_recipes/);
  assert.match(
    sql,
    /ON CONFLICT \(finished_good_id, ingredient_id, tenant_id\)/,
  );
});

test("ingredient import action uses one bulk RPC and sanitized error handling", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const body = sourceBetween(
    source,
    "export async function importIngredients",
    "export async function downloadIngredientTemplate",
  );

  assert.match(body, /\.rpc\("bulk_import_ingredients"/);
  assert.doesNotMatch(body, /upsert_ingredient_catalog/);
  assert.doesNotMatch(body, /error:\s*rpcErr\.message/);
  assert.match(
    body,
    /mapBulkIngredientImportError\(rpcErr\.code, rpcErr\.message\)/,
  );
});

test("production recipe import action uses one bulk RPC and sanitized error handling", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  );
  const body = sourceBetween(
    source,
    "export async function importProductionRecipes",
    "export const upsertProductionRecipeLines",
  );

  assert.match(body, /\.rpc\(\s*"bulk_import_production_recipes"/);
  assert.doesNotMatch(body, /upsert_production_recipe_lines/);
  assert.doesNotMatch(body, /error:\s*rpcError\.message/);
  assert.match(
    body,
    /mapProductionRecipeImportError\(rpcError\.code, rpcError\.message\)/,
  );
});
