import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const hardeningSql = readRepo(
  "supabase/migrations/_archive/20260629144952_ingredient_catalog_tenant_scope_hardening.sql",
);
const ingredientActionSource = readRepo(
  "apps/web/app/(protected)/inventory/ingredient-actions.ts",
);
const recipeActionSource = readRepo(
  "apps/web/app/(protected)/inventory/recipe-actions.ts",
);
const recipeUpsertSql = readRepo(
  "supabase/migrations/20260708112544_allow_inventory_recipe_upsert.sql",
);

test("ingredient catalog tenant-scope hardening enforces new cross-tenant rows", () => {
  for (const constraint of [
    "ingredient_units_ingredient_tenant_fkey",
    "ingredient_units_unit_tenant_fkey",
    "ingredients_category_tenant_fkey",
  ]) {
    assert.match(
      hardeningSql,
      new RegExp(`${constraint}[\\s\\S]*NOT VALID`),
      constraint,
    );
  }

  assert.match(
    hardeningSql,
    /LEFT JOIN public\.units u[\s\S]*u\.tenant_id = v_tenant[\s\S]*u\.is_active/,
  );
  assert.match(
    hardeningSql,
    /FROM public\.ingredient_categories[\s\S]*tenant_id = v_tenant[\s\S]*AND is_active/,
  );
  assert.match(
    hardeningSql,
    /WHERE ingredient_id = p_ingredient_id[\s\S]*AND unit_id = p_unit_id[\s\S]*AND tenant_id = public\.auth_tenant_id\(\)/,
  );
});

test("ingredient catalog callable RPC privileges are explicit", () => {
  assert.match(
    hardeningSql,
    /REVOKE ALL ON FUNCTION public\.upsert_ingredient_catalog[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    hardeningSql,
    /GRANT EXECUTE ON FUNCTION public\.upsert_ingredient_catalog[\s\S]*TO authenticated;/,
  );
  assert.match(
    hardeningSql,
    /REVOKE ALL ON FUNCTION public\.inv_to_base\(bigint, bigint, numeric\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    hardeningSql,
    /GRANT EXECUTE ON FUNCTION public\.inv_to_base\(bigint, bigint, numeric\) TO authenticated;/,
  );
});

test("ingredient catalog updates preserve shelf life required by the RPC", () => {
  assert.match(
    ingredientActionSource,
    /p_shelf_life_days:\s*shelfLifeDays as never/,
  );
  assert.match(
    ingredientActionSource,
    /\.select\("shelf_life_days"\)[\s\S]*\.eq\("tenant_id", claims\.tenant_id\)[\s\S]*rpcCatalogArgs\([\s\S]*existing\.shelf_life_days/,
  );
});

test("recipe line upsert accepts inventory catalog permissions", () => {
  assert.match(
    recipeActionSource,
    /anyPermission:\s*\[[\s\S]*CATALOG_MANAGE_PERMISSIONS[\s\S]*PERMISSION_KEYS\.MENU_WRITE/,
  );
  assert.doesNotMatch(
    recipeActionSource,
    /permission:\s*PERMISSION_KEYS\.INVENTORY_WRITE/,
  );
  assert.match(
    recipeUpsertSql,
    /public\.has_permission_any\('inventory:write'\)[\s\S]*OR public\.has_permission_any\('menu:write'\)/,
  );
  assert.match(
    recipeUpsertSql,
    /GRANT EXECUTE ON FUNCTION public\.upsert_recipe_lines\(bigint, jsonb, bigint\) TO authenticated, service_role;/,
  );
});
