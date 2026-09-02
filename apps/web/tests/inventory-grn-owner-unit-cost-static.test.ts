import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("ISS-05 owner patch RPC is owner-only append-only GRN price repair", () => {
  const sql = read(
    "supabase/migrations/20260819173021_owner_patch_confirmed_grn_unit_cost.sql",
  );
  const booked = read(
    "supabase/migrations/20260820014701_owner_patch_confirmed_grn_booked_value.sql",
  );

  assertSqlMatch(sql, /auth_is_owner/);
  assertSqlMatch(sql, /owner_patch_confirmed_grn_unit_cost/);
  assertSqlMatch(sql, /list_unpriced_confirmed_grn_lines/);
  assertSqlMatch(sql, /suggest_same_supplier_confirmed_grn_unit_cost/);
  assertSqlMatch(sql, /owner_grn_unit_cost_patch/);
  assertSqlMatch(sql, /private\.grn_line_book_total/);
  assertSqlMatch(sql, /private\.project_company_wac/);
  assertSqlMatch(sql, /quantity_delta/);
  assertSqlMatch(sql, /provisional_reprice/);
  assertSqlMatch(sql, /candidate\.supplier_id = v_item\.supplier_id/);
  assertSqlMatch(sql, /unit_cost > 0/);
  assertSqlNotMatch(sql, /confirm_goods_receipt_note\s*\(/);
  assertSqlNotMatch(sql, /UPDATE public\.stock_movements/);
  assertSqlNotMatch(sql, /invoice_reprice\s*\(/);
  assertSqlNotMatch(sql, /UPDATE public\.stock_levels/);
  assertSqlNotMatch(sql, /yield_factor/);
  assertSqlNotMatch(sql, /create_purchase_order\s*\(/);
  assertSqlMatch(booked, /coalesce\(v_origin\.finalized_value, 0\) > 0/);
  assertSqlMatch(booked, /private\.ingredient_company_wac/);
  assertSqlMatch(booked, /IF v_delta <> 0 THEN/);
});

test("ISS-05 SQL proof covers same-NCC suggestion, empty, book total, qty 0, and rejects", () => {
  const proof = read(
    "supabase/tests/owner_patch_confirmed_grn_unit_cost_test.sql",
  );

  assert.match(proof, /same-NCC suggestion expected 24000\/pack/);
  assert.match(
    proof,
    /suggestion must be empty when no same-NCC priced GRN/,
  );
  assert.match(proof, /book total must use price unit \(246000\)/);
  assert.match(proof, /quantity_delta must be 0/);
  assert.match(proof, /unit_cost 0 must be rejected/);
  assert.match(proof, /wrong unit must be rejected/);
  assert.match(proof, /non-owner must be rejected/);
  assert.match(proof, /provisional_reprice with quantity_delta 0/);
  assert.match(proof, /partial booked origin must be value_delta 0/);
  assert.match(proof, /matching booked value must not insert restatement/);
  assert.match(proof, /matching booked value must not change origin book/);
});

test("ISS-05 Server Action is owner-only Zod wrap of the patch RPC", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );
  const patchStart = actions.indexOf("ownerPatchConfirmedGrnUnitCostSchema");
  assert.ok(patchStart >= 0);
  const patchBlock = actions.slice(patchStart);

  assert.match(patchBlock, /ownerPatchConfirmedGrnUnitCost/);
  assert.match(patchBlock, /roles: \["owner"\] as const/);
  assert.match(patchBlock, /z\.coerce\.number\(\)\.gt\(0\)/);
  assert.match(patchBlock, /z\.string\(\)\.trim\(\)\.min\(10\)/);
  assert.match(patchBlock, /owner_patch_confirmed_grn_unit_cost" as never/);
  assert.match(patchBlock, /grnOwnerUnitCostRpcMappings/);
  assertSqlMatch(read("apps/web/lib/messages/inventory-rpc-errors.ts"),
    /inventory_origin_balances_book_value_check/,
  );
  assert.doesNotMatch(patchBlock, /confirm_goods_receipt_note/);
});

test("ISS-05 Owner UI reuses GRN LIST + document dialog for Chờ đơn giá", () => {
  const list = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const dialog = read(
    "apps/web/app/(protected)/inventory/grn/[id]/views/confirmed-grn-unit-cost-dialog.tsx",
  );
  const queue = read(
    "apps/web/app/(protected)/inventory/grn/grn-unpriced-queue.tsx",
  );
  const copy = read("apps/web/lib/messages/inventory.ts");
  const page = read("apps/web/app/(protected)/inventory/grn/page.tsx");

  assert.match(list, /OWNER_UNPRICED_GRN_STATUS/);
  assert.match(list, /ConfirmedGrnUnitCostDialog/);
  assert.match(list, /GrnUnpricedQueueTable/);
  assert.match(dialog, /ReasonConfirmDialog/);
  assert.match(dialog, /MoneyVndInput/);
  assert.match(dialog, /ownerPatchConfirmedGrnUnitCost/);
  assert.match(queue, /valuationCopy\.pendingInvoice/);
  assert.match(copy, /tab: "Chờ đơn giá"/);
  assert.match(copy, /Không có đơn giá cùng nhà cung cấp/);
  assert.match(page, /GrnDocumentDialogHost/);
  assert.doesNotMatch(dialog, /export function Owner/);
});
