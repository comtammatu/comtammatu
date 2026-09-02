import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260824015244_ingredient_catalog_warehouse_write_and_unit_cap.sql",
);
const thresholdAuthorityMigration = read(
  "supabase/migrations/20260902153415_align_inventory_threshold_catalog_authority.sql",
);
const permissions = read("packages/shared/src/auth/permissions.ts");
const inventoryRoles = read("packages/shared/src/auth/inventory-roles.ts");
const ingredientActions = read(
  "apps/web/app/(protected)/inventory/ingredient-actions.ts",
);
const unitsActions = read(
  "apps/web/app/(protected)/inventory/settings/units/units-actions.ts",
);
const catalogPermissions = read(
  "apps/web/app/(protected)/inventory/_lib/catalog-permissions.ts",
);
const thresholdActions = read(
  "apps/web/app/(protected)/inventory/settings/thresholds/actions.ts",
);
const stockActions = read(
  "apps/web/app/(protected)/inventory/stock-actions.ts",
);
const wizard = read(
  "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
);

test("ADR 0045 seeds inventory:catalog_write and keeps the TS mirror in sync", () => {
  assert.match(migration, /'inventory:catalog_write'/);
  assert.match(migration, /INSERT INTO public\.permission_keys/);
  assert.match(migration, /SELECT 'tenant_owner', key/);
  assert.match(permissions, /INVENTORY_CATALOG_WRITE: "inventory:catalog_write"/);
});

test("ADR 0045 RPC gate is capability or warehouse position, not the owner role", () => {
  assert.match(
    migration,
    /public\.has_permission_any\('inventory:catalog_write'\)/,
  );
  assert.match(migration, /public\.has_position\('central_supply_ops'\)/);
  assert.doesNotMatch(migration, /auth_role\(\) <> 'owner'/);
  // The 20-unit cap restored after the 20260820030125 regression.
  assert.match(migration, /jsonb_array_length\(p_units\) NOT BETWEEN 1 AND 20/);
  assert.doesNotMatch(migration, /NOT BETWEEN 1 AND 3\b/);
});

test("ADR 0045 opens catalog write actions to warehouse ops behind one role list", () => {
  assert.match(
    inventoryRoles,
    /INGREDIENT_CATALOG_WRITE_ROLES: readonly StaffRole\[\] = \[\s*"owner",\s*"central_supply_ops",\s*\]/,
  );
  // Menu recipes stay owner-only through the untouched legacy constant.
  assert.match(
    inventoryRoles,
    /INVENTORY_CATALOG_ROLES: readonly StaffRole\[\] = \["owner"\]/,
  );
  assert.match(ingredientActions, /INGREDIENT_CATALOG_WRITE_ROLES/);
  assert.match(unitsActions, /INGREDIENT_CATALOG_WRITE_ROLES/);
  assert.doesNotMatch(ingredientActions, /roles: INVENTORY_CATALOG_ROLES/);
});

test("catalog settings expose the same dedicated capabilities enforced by actions", () => {
  assert.match(
    catalogPermissions,
    /CATALOG_MANAGE_PERMISSIONS\s*=\s*\[\s*PERMISSION_KEYS\.INVENTORY_CATALOG_WRITE,?\s*\]/,
  );
  assert.match(
    catalogPermissions,
    /UNITS_MASTER_PERMISSIONS\s*=\s*\[\s*PERMISSION_KEYS\.INVENTORY_UNITS_MASTER,?\s*\]/,
  );
  assert.doesNotMatch(
    catalogPermissions,
    /CATALOG_MANAGE_PERMISSIONS[\s\S]*?PERMISSION_KEYS\.INVENTORY_WRITE/,
  );
  assert.match(thresholdActions, /INGREDIENT_CATALOG_WRITE_ROLES/);
  assert.doesNotMatch(thresholdActions, /INVENTORY_CATALOG_ROLES/);
  assert.match(
    thresholdAuthorityMigration,
    /public\.has_permission_any\('inventory:catalog_write'\)/,
  );
  assert.match(
    thresholdAuthorityMigration,
    /public\.has_position\('central_supply_ops'\)/,
  );
  assert.doesNotMatch(
    thresholdAuthorityMigration,
    /auth_role\(\) <> 'owner'[\s\S]{0,80}has_permission_any\('inventory:write'\)/,
  );
});

test("location threshold RPC matches the operational roles exposed by stock UI", () => {
  assert.match(stockActions, /roles:\s*INVENTORY_OPS_ROLES/);
  assert.match(stockActions, /"upsert_branch_stock_thresholds"/);
  assert.match(
    stockActions,
    /minStockLevel: inventoryNonnegativeQuantitySchema/,
  );
  assert.match(
    stockActions,
    /targetStockLevel: inventoryNonnegativeQuantitySchema/,
  );
  assert.match(
    stockActions,
    /reorderQuantity: inventoryNonnegativeQuantitySchema\.nullable\(\)\.optional\(\)/,
  );
  assert.match(
    thresholdAuthorityMigration,
    /CREATE OR REPLACE FUNCTION public\.upsert_branch_stock_thresholds\([\s\S]*?p_location_id bigint/,
  );
  assert.match(
    thresholdAuthorityMigration,
    /public\.has_position\('central_supply_ops'\)/,
  );
  assert.match(thresholdAuthorityMigration, /'central_kitchen_lead'/);
  assert.match(thresholdAuthorityMigration, /'branch_manager'/);
  assert.match(
    thresholdAuthorityMigration,
    /jsonb_array_length\(p_thresholds\) NOT BETWEEN 1 AND 500/,
  );
  assert.match(
    thresholdAuthorityMigration,
    /v_reorder_quantity IN \([\s\S]*?'NaN'::numeric,[\s\S]*?'Infinity'::numeric,[\s\S]*?'-Infinity'::numeric[\s\S]*?\)/,
  );
});

test("ADR 0045 wizard keeps the atomic catalog RPC as the only save path", () => {
  assert.match(wizard, /createIngredient|updateIngredient/);
  assert.match(wizard, /WizardStepHeader/);
  assert.match(wizard, /InlineUnitCreator/);
  // Conversions default to the standard unit; the anchor chain stays
  // reachable through per-row advanced mode.
  assert.match(wizard, /\[nextValue\]: baseUnitId/);
  assert.match(wizard, /advancedConversion/);
  assert.doesNotMatch(wizard, /from\("ingredients"\)\.insert/);
  assert.doesNotMatch(wizard, /from\("ingredient_units"\)\.insert/);
});
