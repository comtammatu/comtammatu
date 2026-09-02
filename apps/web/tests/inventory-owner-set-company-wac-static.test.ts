import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("ISS-06 owner WAC RPC is owner-only append-only Giá vốn restatement", () => {
  const sql = read("supabase/migrations/20260820014906_owner_set_company_wac.sql");

  assertSqlMatch(sql, /auth_is_owner/);
  assertSqlMatch(sql, /owner_set_company_wac/);
  assertSqlMatch(sql, /private\.project_company_wac/);
  assertSqlMatch(sql, /private\.propagate_inventory_origin_reprice/);
  assertSqlMatch(sql, /quantity_delta/);
  assertSqlMatch(sql, /provisional_reprice/);
  assertSqlMatch(sql, /finished_good_wac_overwrite_forbidden/);
  assertSqlMatch(sql, /v_kind IS DISTINCT FROM 'raw_material'/);
  assertSqlMatch(sql, /company_wac_invalid/);
  assertSqlMatch(sql, /reason_required/);
  assertSqlNotMatch(sql, /confirm_goods_receipt_note\s*\(/);
  assertSqlNotMatch(sql, /UPDATE public\.stock_movements/);
  assertSqlNotMatch(sql, /UPDATE public\.grn_items/);
  assertSqlNotMatch(sql, /invoice_reprice\s*\(/);
  assertSqlNotMatch(sql, /ingredients\.unit_cost\s*=/);
  assertSqlNotMatch(sql, /create_purchase_order\s*\(/);
  assertSqlNotMatch(sql, /owner_patch_confirmed_grn_unit_cost/);
});

test("ISS-06 SQL proof covers owner-only, qty, WAC, FG, zero, and reason", () => {
  const proof = read("supabase/tests/owner_set_company_wac_test.sql");

  assert.match(proof, /quantity_delta must be 0/);
  assert.match(proof, /stock qty must be unchanged/);
  assert.match(proof, /company WAC must update to 15000/);
  assert.match(proof, /book_value must equal qty × new WAC/);
  assert.match(proof, /catalog Giá tham chiếu must stay unchanged/);
  assert.match(proof, /must not edit confirmed GRN lines/);
  assert.match(proof, /unit_cost 0 must be rejected/);
  assert.match(proof, /short reason must be rejected/);
  assert.match(proof, /finished good must be rejected/);
  assert.match(proof, /non-owner must be rejected/);
  assert.match(proof, /leftover qty must stay 4/);
  assert.match(proof, /provisional_reprice with quantity_delta 0/);
});

test("ISS-06 Server Action is owner-only Zod wrap of the WAC RPC", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/stock-actions.ts",
  );
  const start = actions.indexOf("ownerSetCompanyWacSchema");
  assert.ok(start >= 0);
  const block = actions.slice(start);

  assert.match(block, /ownerSetCompanyWac/);
  assert.match(block, /roles: \["owner"\] as const/);
  assert.match(block, /z\.coerce\.number\(\)\.gt\(0\)/);
  assert.match(block, /z\.string\(\)\.trim\(\)\.min\(10\)/);
  assert.match(block, /owner_set_company_wac" as never/);
  assert.match(block, /ownerSetCompanyWacRpcMappings/);
  assert.doesNotMatch(block, /owner_patch_confirmed_grn_unit_cost/);
  assert.doesNotMatch(block, /save_ingredient_catalog/);
});

test("ISS-06 Owner UI sets Giá vốn on Tồn kho, not GRN Chờ đơn giá", () => {
  const dialog = read(
    "apps/web/app/(protected)/inventory/stock/company-wac-dialog.tsx",
  );
  const detail = read(
    "apps/web/app/(protected)/inventory/stock/stock-detail-dialog.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );
  const copy = read("apps/web/lib/messages/inventory.ts");
  const ingredientDialog = read(
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  const detailData = read(
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
  );

  assert.match(dialog, /ReasonConfirmDialog/);
  assert.match(dialog, /MoneyVndInput/);
  assert.match(dialog, /ownerSetCompanyWac/);
  assert.match(dialog, /resolveStockDisplayUnit/);
  assert.doesNotMatch(dialog, /resolveStockCompactUnit/);
  assert.doesNotMatch(dialog, /export function Owner/);
  assert.match(detail, /CompanyWacDialog|onSetCompanyWac/);
  assert.match(client, /CompanyWacDialog/);
  assert.match(client, /canSetCompanyWac/);
  assert.match(copy, /setCompanyWac: "Ghi Giá vốn"/);
  assert.match(copy, /referenceCostLabel: "Giá tham chiếu"/);
  assert.match(copy, /wac: "Giá vốn"/);
  assert.doesNotMatch(ingredientDialog, /ownerSetCompanyWac/);
  assert.doesNotMatch(dialog, /Chờ đơn giá/);
  assert.doesNotMatch(detailData, /referenceUnitCost/);
  assert.doesNotMatch(detailData, /ingredientRow\.unit_cost/);
  assert.match(detailData, /lastPositiveWac/);
});
