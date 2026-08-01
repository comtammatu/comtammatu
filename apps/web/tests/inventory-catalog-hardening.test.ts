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
  "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
);
const roleUnitMigration = readRepo(
  "supabase/migrations/20260731172142_inventory_unit_roles_and_snapshots.sql",
);
const independentRoleMigration = readRepo(
  "supabase/migrations/20260801151413_independent_inventory_unit_roles.sql",
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

test("inventory unit conversion RPC privileges are explicit", () => {
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
  assert.match(ingredientActionSource, /p_shelf_life_days:\s*shelfLifeDays/);
  assert.match(
    ingredientActionSource,
    /\.select\("shelf_life_days, default_fulfill_site_kind"\)[\s\S]*\.eq\("tenant_id", claims\.tenant_id\)[\s\S]*rpcCatalogArgs\([\s\S]*existing\.shelf_life_days/,
  );
});

test("recipe line upsert stays behind the owner catalog role", () => {
  assert.match(recipeActionSource, /roles:\s*INVENTORY_CATALOG_ROLES/);
  assert.match(
    recipeActionSource,
    /anyPermission:\s*\[[\s\S]*CATALOG_MANAGE_PERMISSIONS[\s\S]*PERMISSION_KEYS\.MENU_WRITE/,
  );
  assert.doesNotMatch(
    recipeActionSource,
    /permission:\s*PERMISSION_KEYS\.INVENTORY_WRITE/,
  );
});

test("role-unit migration snapshots historical document factors without weakening linked-line guards", () => {
  assert.match(roleUnitMigration, /entry_to_base_factor numeric\(18,12\)/);
  assert.match(roleUnitMigration, /entry_unit_code text/);
  assert.match(roleUnitMigration, /standard_unit_dimension_mismatch/);
  assert.match(
    roleUnitMigration,
    /to_jsonb\(NEW\) - 'entry_to_base_factor' - 'entry_unit_code'/,
  );
});

test("catalog role factors are independent while base membership and dimensions stay guarded", () => {
  assert.match(
    independentRoleMigration,
    /CREATE OR REPLACE FUNCTION public\.save_ingredient_catalog\(/,
  );
  assert.match(independentRoleMigration, /SECURITY DEFINER/);
  assert.match(independentRoleMigration, /SET search_path TO ''/);
  assert.match(
    independentRoleMigration,
    /v_base_unit_id IS DISTINCT FROM p_receipt_unit_id[\s\S]*v_base_unit_id IS DISTINCT FROM p_issue_unit_id[\s\S]*v_base_unit_id IS DISTINCT FROM p_production_unit_id/,
  );
  assert.match(independentRoleMigration, /standard_unit_dimension_mismatch/);
  assert.match(independentRoleMigration, /inventory_unit_roles_invalid/);
  assert.doesNotMatch(
    independentRoleMigration,
    /inventory_unit_role_order_invalid/,
  );
  assert.doesNotMatch(
    independentRoleMigration,
    /v_receipt_factor < v_issue_factor|v_issue_factor < v_production_factor/,
  );
  assert.doesNotMatch(
    ingredientActionSource,
    /Nhập ≥ Xuất ≥ Sản xuất|receipt\.to_base_factor < issue\.to_base_factor/,
  );
  assert.match(
    ingredientActionSource,
    /Đơn vị tồn chuẩn phải thuộc ít nhất một vai trò/,
  );
  assert.match(
    independentRoleMigration,
    /REVOKE ALL ON FUNCTION public\.save_ingredient_catalog\([\s\S]*FROM PUBLIC, anon/,
  );
  assert.match(
    independentRoleMigration,
    /GRANT EXECUTE ON FUNCTION public\.save_ingredient_catalog\([\s\S]*TO authenticated, service_role/,
  );
});
