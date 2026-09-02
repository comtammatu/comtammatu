import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);
const readWeb = (path: string) =>
  readSql(process.cwd(), path);

test("finished goods without a production recipe reclassify to raw_material", () => {
  const sql = read(
    "supabase/migrations/20260817191420_finished_good_produced_recipe_only.sql",
  );

  assertSqlMatch(sql, /item_kind = 'raw_material'/);
  assertSqlMatch(sql, /production_recipe_specs/);
  assertSqlMatch(sql, /production_output/);
  assertSqlMatch(sql, /finished_good_not_purchased/);
  assertSqlMatch(sql, /trg_supplier_items_require_purchased/);
  assertSqlMatch(sql, /trg_purchase_request_items_require_purchased/);
  assertSqlMatch(sql, /trg_purchase_order_items_require_purchased/);
  assertSqlMatch(sql, /trg_grn_items_require_purchased/);
  assertSqlMatch(sql, /bulk_create_supplier_items/);
  assertSqlNotMatch(sql, /trg_stock_request/);
});

test("purchase pickers exclude finished goods and map the purchase error", () => {
  const readiness = readWeb("lib/inventory/catalog-readiness.ts");
  const poPage = readWeb(
    "app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const branchPr = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/page.tsx",
  );
  const suppliers = readWeb(
    "app/(protected)/inventory/suppliers/page.tsx",
  );
  const grnAdd = readWeb(
    "app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  const rpc = readWeb("lib/messages/inventory-rpc-errors.ts");
  const copy = readWeb("lib/messages/inventory.ts");

  assert.match(readiness, /filterPurchasedIngredientRows/);
  assert.match(poPage, /filterPurchasedIngredientRows/);
  assert.match(branchPr, /filterPurchasedIngredientRows/);
  assert.match(suppliers, /catalogItemRequiresSupplierLink/);
  assert.match(grnAdd, /filterPurchasedIngredientRows/);
  assert.match(rpc, /finished_good_not_purchased/);
  assert.match(rpc, /Thành phẩm không mua từ nhà cung cấp/);
  assert.match(copy, /finishedGoodHint:/);
  assert.match(copy, /công thức sản xuất/);
});

test("ADR 0040 and glossary lock FG to recipe-produced SKUs", () => {
  const adr = read("docs/plan/adr/0040-company-wac-and-cost-restatement.md");
  const glossary = read("docs/ref/glossary.md");
  const inventory = read("docs/ref/inventory.md");

  assert.match(adr, /kitchen-produced SKU with a production/);
  assert.match(adr, /Purchased bottles, lids, and similar stay [`]raw_material[`]/);
  assert.match(glossary, /hàng Bếp Trung Tâm sản xuất có công thức/);
  assert.match(inventory, /chỉ SKU Bếp TT sản xuất có công thức/);
});
