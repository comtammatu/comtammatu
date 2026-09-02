import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(`${root}${path}`, "utf8");
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, start);
  assert.notEqual(endIndex, -1, end);
  return source.slice(startIndex, endIndex);
}

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

  assert.match(body, /\.rpc\(\s*"bulk_import_production_recipe_specs"/);
  assert.doesNotMatch(body, /upsert_production_recipe_lines/);
  assert.doesNotMatch(body, /error:\s*rpcError\.message/);
  assert.match(
    body,
    /mapProductionRecipeImportError\(rpcError\.code, rpcError\.message\)/,
  );
});
