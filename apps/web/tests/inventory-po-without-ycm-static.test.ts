import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("Wave 1 RPC creates a PO without YCM and mints Auto-GRN on send", () => {
  const sql = read(
    "supabase/migrations/20260820001437_create_purchase_order_without_ycm.sql",
  );
  const proof = read(
    "supabase/tests/create_purchase_order_without_ycm_test.sql",
  );

  assertSqlMatch(sql, /CREATE OR REPLACE FUNCTION public\.create_purchase_order/);
  assertSqlMatch(sql,
    /p_supplier_id,\s*\n\s*NULL,\s*\n\s*v_po_number/,
  );
  assertSqlMatch(sql, /private\.ensure_grn_draft_for_po/);
  assertSqlMatch(sql, /supplier_item_mapping_required/);
  assertSqlMatch(sql, /finished_good_not_purchased/);
  assertSqlMatch(sql, /IF v_po_status IN \('draft', 'changes_requested'\)/);
  assertSqlMatch(sql, /NEW\.status IN \('sent', 'approved', 'partially_received'\)/);
  assertSqlMatch(sql, /central_supply_ops/);
  assertSqlMatch(sql, /central_kitchen_lead/);
  assertSqlMatch(sql, /'procurement:po_create'/);
  assertSqlNotMatch(sql, /unit_price/);
  assertSqlNotMatch(sql, /send_purchase_order/);
  assertSqlNotMatch(sql, /owner_patch_confirmed_grn_unit_cost/);
  assertSqlNotMatch(sql, /DROP TABLE/);

  assert.match(proof, /sent PO must have null YCM FK/);
  assert.match(proof, /send must reject unmapped lines/);
  assert.match(proof, /unmapped draft must not Auto-GRN/);
  assert.match(proof, /warehouse send must mint Auto-GRN/);
  assert.match(proof, /branch_manager must be forbidden/);
});

test("Wave 1 orders tab can Tạo đơn; YCM tab stays readable without create", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const form = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-order-form-dialog.tsx",
  );
  const demand = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const copy = read("apps/web/lib/messages/inventory.ts");
  const roles = read("packages/shared/src/auth/inventory-roles.ts");

  assert.match(actions, /export const createPurchaseOrder/);
  assert.match(actions, /"create_purchase_order" as never/);
  assert.match(actions, /PO_CREATE_ROLES/);
  assert.match(actions, /export const savePurchaseDemand/);
  assert.match(actions, /export const reviewPurchaseDemand/);
  assert.match(actions, /ycmWriteFrozen/);
  assert.doesNotMatch(actions, /"save_purchase_demand" as never/);
  assert.doesNotMatch(actions, /"save_purchase_demand_allocations" as never/);
  assert.doesNotMatch(actions, /"review_purchase_demand" as never/);
  assert.doesNotMatch(actions, /"cancel_purchase_request" as never/);
  assert.doesNotMatch(actions, /"close_purchase_request" as never/);
  assert.match(page, /canCreate=\{canManagePo && createBranches\.length > 0\}/);
  assert.doesNotMatch(page, /PurchaseRequestsClient/);
  assert.doesNotMatch(page, /canCreateRequest=\{false\}/);
  assert.match(page, /loadPurchaseOrderRows/);
  assert.match(client, /copy\.createAction/);
  assert.match(client, /mode === "create"/);
  assert.match(client, /pickDefaultPurchaseDemandSupplier/);
  assert.match(client, /unmappedSendBlocked/);
  assert.match(form, /variant="document"/);
  assert.match(form, /matchingSuppliersForIngredient/);
  assert.match(form, /mappedIngredientIds|mappedIngredients/);
  assert.match(form, /disabled=\{!canEditLines\}/);
  assert.match(form, /multiSupplierPreview/);
  assert.doesNotMatch(form, /selectSupplierFirst/);
  assert.doesNotMatch(form, /unmappedLineWarning/);
  assert.equal([...form.matchAll(/<AppDialog\b/g)].length, 1);
  assert.match(demand, /savePurchaseDemand/);
  assert.match(copy, /createAction: "Tạo đơn"/);
  assert.match(copy, /multiSupplierPreview:/);
  assert.match(copy, /noMappedIngredients:/);
  assert.match(copy, /needsTab: "Yêu cầu mua"/);
  assert.match(copy, /writeFrozen: "Yêu cầu mua đã gỡ/);
  assert.match(roles, /"central_supply_ops"/);
  assert.match(roles, /"central_kitchen_lead"/);
  assert.doesNotMatch(client, /unitPrice|Đơn giá/);
  assert.doesNotMatch(form, /unitPrice|Đơn giá/);
});
