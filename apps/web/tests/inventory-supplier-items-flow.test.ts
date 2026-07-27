import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("supplier item management is permission-gated and tenant-scoped", () => {
  const actions = readRepo(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/actions.ts",
  );
  const page = readRepo(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/page.tsx",
  );

  assert.match(
    actions,
    /permission: PERMISSION_KEYS\.PROCUREMENT_PRICE_LIST_WRITE/,
  );
  assert.match(actions, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(actions, /\.eq\("supplier_id", data\.supplierId\)/);
  assert.match(page, /PERMISSION_KEYS\.PROCUREMENT_PRICE_LIST_READ/);
  assert.match(page, /\.eq\("is_active", true\)/);
});

test("PO and supplier-first GRN load only mapped active ingredients", () => {
  const poPage = readRepo(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const poClient = readRepo(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grnLoader = readRepo("apps/web/lib/inventory/grn-create-data.ts");

  assert.match(poPage, /\.from\("supplier_items"\)/);
  assert.match(poPage, /supplierIdsByIngredient/);
  assert.match(poClient, /item\.supplierIds\.includes\(Number\(supplierId\)\)/);
  assert.match(grnLoader, /\.from\("supplier_items"\)/);
  assert.match(grnLoader, /allowedIngredientIds\.has\(ingredient\.id\)/);
});

test("Server Actions reject supplier-mismatched PO and GRN lines", () => {
  const poActions = readRepo(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const grnActions = readRepo(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );

  assert.match(poActions, /validateSupplierIngredients/);
  assert.match(poActions, /Có nguyên liệu chưa được gán cho nhà cung cấp\./);
  assert.match(grnActions, /\.eq\("supplier_id", grn\.supplier_id\)/);
  assert.match(
    grnActions,
    /Phiếu có nguyên liệu chưa được gán cho nhà cung cấp\./,
  );
});

test("database triggers enforce mappings on line writes and document approval", () => {
  const migration = readRepo(
    "supabase/migrations/20260727150000_enforce_supplier_item_mapping.sql",
  );

  for (const trigger of [
    "purchase_order_items_supplier_mapping",
    "grn_items_supplier_mapping",
    "purchase_orders_supplier_mapping_on_approval",
    "goods_received_notes_supplier_mapping_on_confirm",
  ]) {
    assert.match(migration, new RegExp(`CREATE TRIGGER ${trigger}`));
  }
  assert.match(migration, /supplier_item_mapping_required/);
  assert.match(migration, /si\.is_active/);
});
