import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "../..");
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

test("supplier item batch mapping is atomic and tenant-scoped", () => {
  const migration = read(
    "supabase/migration-archive/20260729160100_bulk_create_supplier_items.sql",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/actions.ts",
  );
  const databaseTypes = read("packages/database/src/types/database.types.ts");

  assert.match(migration, /bulk_create_supplier_items/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /tenant_id = v_tenant_id/);
  assert.match(
    migration,
    /has_permission_any\('procurement:price_list_write'\)/,
  );
  assert.match(migration, /duplicate_ingredient/);
  assert.match(migration, /DROP COLUMN supplier_sku_code/);
  assert.match(migration, /UNIQUE \(tenant_id, supplier_id, ingredient_id\)/);
  assert.match(actions, /\.rpc\("bulk_create_supplier_items"/);
  assert.doesNotMatch(actions, /supplierSkuCode|supplier_sku_code/);
  assert.doesNotMatch(actions, /\.from\("supplier_items"\)\.insert/);
  assert.match(databaseTypes, /bulk_create_supplier_items:/);
  assert.doesNotMatch(databaseTypes, /supplier_sku_code/);
});

test("supplier UI supports bulk selection and displays active ingredient counts", () => {
  const supplierActions = read(
    "apps/web/app/(protected)/inventory/supplier-actions.ts",
  );
  const itemsClient = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );
  const suppliersClient = read(
    "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx",
  );

  assert.match(supplierActions, /supplier_items\(count\)/);
  assert.match(supplierActions, /\.eq\("supplier_items\.is_active", true\)/);
  assert.match(itemsClient, /MultiSelectCombobox/);
  assert.match(itemsClient, /useFieldArray/);
  assert.match(itemsClient, /createSupplierItems/);
  assert.doesNotMatch(itemsClient, /supplierSku|Mã hàng NCC/);
  assert.match(suppliersClient, /header: suppliersCopy\.items\.ingredient/);
  assert.match(suppliersClient, /ingredient_count/);
});
