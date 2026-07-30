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
  const suppliersPage = readRepo(
    "apps/web/app/(protected)/inventory/suppliers/page.tsx",
  );

  assert.match(
    actions,
    /permission: PERMISSION_KEYS\.PROCUREMENT_PRICE_LIST_WRITE/,
  );
  assert.match(actions, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(actions, /\.eq\("supplier_id", data\.supplierId\)/);
  assert.match(suppliersPage, /PERMISSION_KEYS\.PROCUREMENT_PRICE_LIST_READ/);
  assert.match(suppliersPage, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(suppliersPage, /\.eq\("is_active", true\)/);
});

test("supplier rows open one addressable AppDialog and detail URL redirects", () => {
  const suppliersClient = readRepo(
    "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx",
  );
  const itemsClient = readRepo(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );
  const detailPage = readRepo(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/page.tsx",
  );

  assert.match(suppliersClient, /next\.set\("supplierId", String\(row\.id\)\)/);
  assert.match(suppliersClient, /onRowClick=\{canReadItems \? openItems/);
  assert.match(suppliersClient, /<SupplierItemsClient/);
  assert.doesNotMatch(
    suppliersClient,
    /router\.push\(`\/inventory\/suppliers\/\$\{row\.id\}\/items`\)/,
  );
  assert.match(itemsClient, /<AppDialog/);
  assert.match(detailPage, /redirect\(`\/inventory\/suppliers\?supplierId=/);
});

test("retrospective procurement maps active ingredients through the GRN", () => {
  const poPage = readRepo(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const poClient = readRepo(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grnLoader = readRepo("apps/web/lib/inventory/grn-create-data.ts");

  assert.doesNotMatch(poPage, /\.from\("supplier_items"\)/);
  assert.doesNotMatch(poClient, /supplierIds|ingredient options/);
  assert.match(grnLoader, /\.from\("supplier_items"\)/);
  assert.match(
    grnLoader,
    /suppliersByIngredient\.get\(ingredient\.id\)\?\.length \?\? 0\) > 0/,
  );
});

test("Server Actions reject supplier-mismatched PO and GRN line writes", () => {
  const poActions = readRepo(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const grnActions = readRepo(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );

  assert.match(poActions, /validateSupplierIngredients/);
  assert.match(poActions, /Có nguyên liệu chưa được gán cho nhà cung cấp\./);
  assert.match(
    grnActions,
    /grn\.supplier_id != null && data\.supplierId !== grn\.supplier_id/,
  );
  assert.match(grnActions, /Nguyên liệu chưa được gán cho nhà cung cấp\./);
});

test("supplier mapping gates draft construction, not GRN confirmation", () => {
  const grnActions = readRepo(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );
  const confirmStart = grnActions.indexOf("export async function confirmGrn");
  const confirmEnd = grnActions.indexOf("/* ─── amendGrnLine", confirmStart);
  assert.ok(confirmStart >= 0 && confirmEnd > confirmStart);
  const confirmAction = grnActions.slice(confirmStart, confirmEnd);

  assert.match(grnActions, /Nguyên liệu chưa được gán cho nhà cung cấp\./);
  assert.doesNotMatch(
    confirmAction,
    /supplier_items|supplier_item_mapping_required/,
  );
  assert.match(confirmAction, /\.rpc\("confirm_goods_receipt_note"/);
});
