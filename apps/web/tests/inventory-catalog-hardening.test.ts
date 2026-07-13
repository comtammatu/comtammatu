import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const hardeningSql = readRepo(
  "supabase/migration-archive/20260629144952_ingredient_catalog_tenant_scope_hardening.sql",
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
const shelfLifeExpandMigration =
  "20260710193275_expand_ingredient_catalog_without_shelf_life.sql";
const shelfLifeContractMigration =
  "20260710193300_retire_lot_expiry_columns.sql";
const expiryAlertRetirementMigration =
  "20260713061000_retire_inventory_expiry_alert_contract.sql";
const shelfLifeExpandSql = readRepo(
  `supabase/migrations/${shelfLifeExpandMigration}`,
);
const shelfLifeContractSql = readRepo(
  `supabase/migrations/${shelfLifeContractMigration}`,
);
const expiryAlertRetirementSql = readRepo(
  `supabase/migrations/${expiryAlertRetirementMigration}`,
);
const productionOrderRetirementSql = readRepo(
  "supabase/migrations/20260710193200_retire_production_orders.sql",
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

test("ingredient catalog actions do not retain the retired shelf-life field", () => {
  assert.doesNotMatch(ingredientActionSource, /shelf_life_days|shelfLifeDays/);
  assert.match(
    ingredientActionSource,
    /message\?\.includes\("ingredient not found"\)/,
  );
});

test("ingredient shelf-life retirement uses an ordered expand-contract cutover", () => {
  assert.ok(shelfLifeExpandMigration < shelfLifeContractMigration);
  assert.ok(shelfLifeContractMigration < expiryAlertRetirementMigration);
  assert.match(shelfLifeExpandSql, /LANGUAGE plpgsql[\s\S]*SECURITY INVOKER/);
  assert.match(
    shelfLifeExpandSql,
    /auth\.uid\(\) IS NULL[\s\S]*public\.has_permission_any\('inventory:write'\)/,
  );
  assert.match(
    shelfLifeExpandSql,
    /ADD CONSTRAINT ingredients_shelf_life_days_retirement_guard[\s\S]*CHECK \(shelf_life_days IS NULL\) NOT VALID;[\s\S]*VALIDATE CONSTRAINT ingredients_shelf_life_days_retirement_guard;/,
  );
  assert.match(
    shelfLifeExpandSql,
    /public\.upsert_ingredient_catalog\([\s\S]*NULL::integer,[\s\S]*p_units/,
  );
  assert.match(
    shelfLifeExpandSql,
    /REVOKE ALL ON FUNCTION public\.upsert_ingredient_catalog\([\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    shelfLifeExpandSql,
    /GRANT EXECUTE ON FUNCTION public\.upsert_ingredient_catalog\([\s\S]*TO authenticated, service_role;/,
  );

  const createElevenArg = shelfLifeContractSql.indexOf(
    "CREATE OR REPLACE FUNCTION public.upsert_ingredient_catalog",
  );
  const dropTwelveArg = shelfLifeContractSql.indexOf(
    "DROP FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, integer, jsonb)",
  );
  assert.ok(createElevenArg >= 0);
  assert.ok(dropTwelveArg > createElevenArg);
  assert.match(
    shelfLifeContractSql,
    /WHERE shelf_life_days IS NOT NULL[\s\S]*ALTER TABLE public\.ingredients DROP COLUMN IF EXISTS shelf_life_days;/,
  );
  assert.match(
    expiryAlertRetirementSql,
    /DROP FUNCTION public\.scan_inventory_alerts\(\);[\s\S]*CREATE FUNCTION public\.scan_inventory_alerts\(\)\s+RETURNS TABLE\(low_stock_count bigint\)/,
  );
  assert.match(
    expiryAlertRetirementSql,
    /COMMENT ON COLUMN public\.notifications\.kind IS[\s\S]*inventory\.stock_low/,
  );
  assert.doesNotMatch(expiryAlertRetirementSql, /expiry_count/);
  assert.doesNotMatch(expiryAlertRetirementSql, /expiry_soon/);
});

test("production-order retirement fails closed around live rows and DDL locks", () => {
  assert.match(productionOrderRetirementSql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(
    productionOrderRetirementSql,
    /SET LOCAL statement_timeout = '60s'/,
  );
  assert.match(
    productionOrderRetirementSql,
    /production_order_retirement_blocked_nonempty/,
  );
  assert.match(
    productionOrderRetirementSql,
    /FROM public\.production_orders[\s\S]*FROM public\.production_order_items/,
  );
  assert.doesNotMatch(productionOrderRetirementSql, /\bCASCADE\b/i);
  const dependentTriggerDrop = productionOrderRetirementSql.indexOf(
    "DROP TRIGGER IF EXISTS trg_production_orders_central_kitchen_only",
  );
  const triggerFunctionDrop = productionOrderRetirementSql.indexOf(
    "DROP FUNCTION IF EXISTS public.ensure_production_order_central_kitchen()",
  );
  assert.ok(
    dependentTriggerDrop >= 0 && dependentTriggerDrop < triggerFunctionDrop,
    "Dependent trigger must be removed before its trigger function",
  );
  const publicationCleanup = productionOrderRetirementSql.indexOf(
    "ALTER PUBLICATION supabase_realtime DROP TABLE",
  );
  const firstTableDrop = productionOrderRetirementSql.indexOf(
    "DROP TABLE IF EXISTS public.production_order_items",
  );
  assert.ok(
    publicationCleanup >= 0 && publicationCleanup < firstTableDrop,
    "Realtime publication membership must be removed before table DDL",
  );
  assert.match(
    productionOrderRetirementSql,
    /DROP TABLE IF EXISTS public\.production_order_items;[\s\S]*DROP TABLE IF EXISTS public\.production_orders;/,
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
