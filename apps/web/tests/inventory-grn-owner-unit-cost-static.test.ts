import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("ISS-05 owner patch RPC is owner-only append-only GRN price repair", () => {
  const sql = read(
    "supabase/migrations/20260819173021_owner_patch_confirmed_grn_unit_cost.sql",
  );

  assert.match(sql, /auth_is_owner/);
  assert.match(sql, /owner_patch_confirmed_grn_unit_cost/);
  assert.match(sql, /list_unpriced_confirmed_grn_lines/);
  assert.match(sql, /suggest_same_supplier_confirmed_grn_unit_cost/);
  assert.match(sql, /owner_grn_unit_cost_patch/);
  assert.match(sql, /private\.grn_line_book_total/);
  assert.match(sql, /private\.project_company_wac/);
  assert.match(sql, /quantity_delta/);
  assert.match(sql, /provisional_reprice/);
  assert.match(sql, /candidate\.supplier_id = v_item\.supplier_id/);
  assert.match(sql, /unit_cost > 0/);
  assert.doesNotMatch(sql, /confirm_goods_receipt_note\s*\(/);
  assert.doesNotMatch(sql, /UPDATE public\.stock_movements/);
  assert.doesNotMatch(sql, /invoice_reprice\s*\(/);
  assert.doesNotMatch(sql, /UPDATE public\.stock_levels/);
  assert.doesNotMatch(sql, /yield_factor/);
  assert.doesNotMatch(sql, /create_purchase_order\s*\(/);
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
