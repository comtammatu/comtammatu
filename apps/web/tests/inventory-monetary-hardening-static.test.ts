import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("inventory monetary reads fail closed at the current runtime boundary", () => {
  const fixture = read("apps/web/tests/fixtures/supabase-e2e/tenant.sql");
  const boundary = read("apps/web/lib/inventory/monetary-access.ts");
  const ingredientActions = read(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const stockData = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const stockDetailData = read(
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
  );
  const financeCockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const financePage = read("apps/web/app/(protected)/finance/page.tsx");

  const accountantTemplate =
    fixture.match(/\('accountant', 'accountant', ARRAY\[[^\]]*\]\)/)?.[0] ?? "";
  const ownerTemplate =
    fixture.match(/\('owner', 'owner', ARRAY\[[^\]]*\]\)/)?.[0] ?? "";
  const centralSupplyTemplate =
    fixture.match(
      /\('central_supply_ops', 'central_supply_ops', ARRAY\[[^\]]*\]\)/,
    )?.[0] ?? "";
  assert.match(accountantTemplate, /procurement:price_list_read/);
  assert.match(centralSupplyTemplate, /procurement:price_list_read/);
  assert.doesNotMatch(accountantTemplate, /inventory:valuation_read/);
  assert.doesNotMatch(centralSupplyTemplate, /inventory:valuation_read/);
  assert.match(ownerTemplate, /inventory:valuation_read/);
  assert.match(
    boundary,
    /role !== "owner" &&\s*role !== "accountant" &&\s*role !== "central_supply_ops"/,
  );
  assert.match(boundary, /client: null/);

  assert.match(ingredientActions, /getAuthContext\(PROCUREMENT_ROLES\)/);
  assert.match(
    stockData,
    /fetchStockBearingLocationIds\(\{\s*supabase: stockReadClient,/,
  );
  assert.match(
    stockDetailData,
    /fetchStockBearingLocationIds\(\{\s*supabase: readClient,/,
  );
  assert.match(
    financeCockpit,
    /canViewInventoryValuation[\s\S]*cockpit\?\.inventoryReadable/,
  );
  assert.match(financeCockpit, /get_finance_operating_cockpit/);
  assert.match(financeCockpit, /includeInventoryChange: canViewInventoryValuation/);
  assert.match(financePage, /cockpit\.canViewInventoryValuation \?/);
});

test("ingredient WAC reads use the permission-gated service client", () => {
  const ingredientActions = read(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const listStart = ingredientActions.indexOf(
    "export async function fetchIngredients(",
  );
  const detailStart = ingredientActions.indexOf(
    "export async function fetchIngredientDetail(",
  );
  const optionStart = ingredientActions.indexOf(
    "export async function fetchUnitOptions(",
  );

  assert.ok(
    listStart >= 0 && detailStart > listStart && optionStart > detailStart,
  );

  const listSource = ingredientActions.slice(listStart, detailStart);
  const detailSource = ingredientActions.slice(detailStart, optionStart);

  for (const source of [listSource, detailSource]) {
    assert.match(
      source,
      /monetary\.purchasePrice\s*\?\s*readClient\s*\.from\("stock_levels"\)/,
    );
    assert.doesNotMatch(
      source,
      /monetary\.purchasePrice\s*\?\s*supabase\s*\.from\("stock_levels"\)/,
    );
  }

  assert.match(listSource, /stockLevelsResult\.error/);
  assert.match(detailSource, /stockLevelResult\.error/);
});

test("stock on hand exposes only WAC and inventory value", () => {
  const stockData = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const stockModel = read("apps/web/lib/inventory/stock-on-hand-model.ts");
  const stockClient = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );
  const valueActions = read(
    "apps/web/app/(protected)/inventory/inventory-value-actions.ts",
  );

  assert.match(stockData, /averageUnitCost = stock\?\.avgUnitCost \?\? null/);
  assert.doesNotMatch(stockData, /referenceUnitCost/);
  assert.doesNotMatch(stockModel, /referenceUnitCost/);
  assert.doesNotMatch(stockClient, /reference-cost|referenceCostPerUnit/);
  assert.match(stockClient, /averageUnitCost == null \? null/);
  assert.doesNotMatch(stockData, /valuationRestoreRequired/);
  assert.doesNotMatch(stockClient, /valuationRestoreRequired/);
  assert.doesNotMatch(
    valueActions,
    /restoreInventoryValuationFromSupplierInvoices/,
  );
});

test("GRN valuation derives price only from confirmed supplier invoices", () => {
  const migrationFiles = readdirSync(
    resolve(repoRoot, "supabase/migration-archive"),
  ).filter((file) =>
    file.endsWith("_invoice_price_authority_for_grn_valuation.sql"),
  );
  assert.equal(migrationFiles.length, 1);
  const migrationFile = migrationFiles[0];
  assert.ok(migrationFile);
  const migration = read(`supabase/migration-archive/${migrationFile}`);
  const purchaseOrderActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const inventoryReference = read("docs/ref/inventory.md");
  const grnArchetype = read(
    "apps/web/e2e/inventory/grn-detail-archetype.spec.ts",
  );

  assert.match(migration, /NEW\.unit_cost := coalesce\(v_unit_price, 0\);/);
  assert.match(migration, /history\.effective_net_unit_price/);
  assert.match(migration, /public\.supplier_ingredient_price_history/);
  assert.match(migration, /zzzz_zero_pending_grn_receipt_valuation/);
  assert.match(migration, /sync_pending_grn_value_from_invoice_allocation/);
  assert.doesNotMatch(migration, /ingredients\.unit_cost/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION[\s\S]*public\.update_purchase_order_prices_protected\(bigint, jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(purchaseOrderActions, /updatePurchaseOrderPrices/);
  assert.doesNotMatch(purchaseOrderActions, /createPurchaseOrderFromRequest/);
  assert.doesNotMatch(purchaseOrderActions, /savePurchaseOrdersFromRequest/);
  assert.doesNotMatch(
    purchaseOrderActions,
    /export const savePurchaseOrder\s*=/,
  );
  assert.doesNotMatch(purchaseOrderActions, /loadInventoryMonetaryAccess/);
  assert.match(grnArchetype, /"save_purchase_demand"/);
  assert.match(grnArchetype, /"review_purchase_demand"/);
  assert.match(grnArchetype, /"create_grn_draft_from_po"/);
  assert.doesNotMatch(grnArchetype, /unit_price/);
  assert.doesNotMatch(grnArchetype, /save_purchase_orders_from_request/);
  assert.match(inventoryReference, /PO không là nguồn giá/);
  assert.match(inventoryReference, /Hóa đơn NCC không viết lại WAC/);
});
