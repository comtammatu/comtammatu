import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("inventory monetary reads fail closed for operational roles", () => {
  const capability = read(
    "supabase/migrations/20260728150000_inventory_monetary_read_capabilities.sql",
  );
  const hardening = read(
    "supabase/migrations/20260728151000_inventory_monetary_column_hardening.sql",
  );
  const boundary = read("apps/web/lib/inventory/monetary-access.ts");
  const createModel = read("apps/web/lib/inventory/grn-create-model.ts");
  const notifications = read(
    "apps/web/app/(protected)/inventory/notifications-actions.ts",
  );
  const ingredientActions = read(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const stockData = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const stockDetailData = read(
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
  );

  for (const role of [
    "central_supply_ops",
    "central_kitchen_lead",
    "branch_manager",
  ]) {
    assert.match(hardening, new RegExp(`'${role}'`));
  }
  assert.match(hardening, /array_remove\(permission_keys/);
  assert.match(capability, /position_code IN \('owner', 'accountant'\)/);
  assert.match(boundary, /role !== "owner" && role !== "accountant"/);
  assert.match(boundary, /client: null/);

  for (const table of [
    "purchase_order_items",
    "grn_items",
    "ingredients",
    "stock_levels",
    "stock_movements",
    "stock_transfer_items",
    "stock_issue_items",
    "supplier_return_items",
    "supplier_invoices",
    "supplier_credit_notes",
    "branch_daily_waste_cap",
  ]) {
    assert.match(hardening, new RegExp(`public\\.${table}`));
  }
  assert.match(hardening, /REVOKE SELECT ON TABLE/);
  assert.doesNotMatch(
    hardening.match(
      /GRANT SELECT \([\s\S]*?\) ON public\.stock_issue_items TO authenticated;/,
    )?.[0] ?? "",
    /unit_cost|total_cost|qty_ratio|rolling_15min_sum|waste_tier/,
  );
  assert.match(createModel, /monetary: \{ unitCost: number \| null \} \| null/);
  assert.match(notifications, /MONETARY_PAYLOAD_KEYS/);
  assert.match(ingredientActions, /getAuthContext\(PROCUREMENT_ROLES\)/);
  assert.match(
    stockData,
    /fetchStockBearingLocationIds\(\{\s*supabase: stockReadClient,/,
  );
  assert.match(
    stockDetailData,
    /fetchStockBearingLocationIds\(\{\s*supabase: readClient,/,
  );
  assert.match(capability, /update_purchase_order_prices_protected/);
  assert.match(hardening, /stock_issue_items_set_writeoff_cost/);
  assert.match(hardening, /REVOKE ALL ON FUNCTION public\.update_purchase_order_prices/);
  assert.match(hardening, /'requires_review', true/);
  assert.doesNotMatch(
    hardening.match(
      /CREATE OR REPLACE FUNCTION public\.trg_grn_requires_review_outbox\(\)[\s\S]*?END;\n\$\$;/,
    )?.[0] ?? "",
    /NEW\.unit_cost|NEW\.price_variance_pct|NEW\.price_override_note/,
  );
});
