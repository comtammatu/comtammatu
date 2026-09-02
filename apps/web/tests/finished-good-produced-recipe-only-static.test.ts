import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const readWeb = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

test("finished goods without a production recipe reclassify to raw_material", () => {
  const sql = read(
    "supabase/migration-archive/20260817191420_finished_good_produced_recipe_only.sql",
  );

  assert.match(sql, /item_kind = 'raw_material'/);
  assert.match(sql, /production_recipe_specs/);
  assert.match(sql, /production_output/);
  assert.match(sql, /finished_good_not_purchased/);
  assert.match(sql, /trg_supplier_items_require_purchased/);
  assert.match(sql, /trg_purchase_request_items_require_purchased/);
  assert.match(sql, /trg_purchase_order_items_require_purchased/);
  assert.match(sql, /trg_grn_items_require_purchased/);
  assert.match(sql, /bulk_create_supplier_items/);
  assert.doesNotMatch(sql, /trg_stock_request/);
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
