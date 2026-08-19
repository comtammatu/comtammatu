import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Wave 1 RPC creates a PO without YCM and mints Auto-GRN on send", () => {
  const sql = read(
    "supabase/migrations/20260820001437_create_purchase_order_without_ycm.sql",
  );
  const proof = read(
    "supabase/tests/create_purchase_order_without_ycm_test.sql",
  );

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_purchase_order/);
  assert.match(
    sql,
    /p_supplier_id,\s*\n\s*NULL,\s*\n\s*v_po_number/,
  );
  assert.match(sql, /private\.ensure_grn_draft_for_po/);
  assert.match(sql, /supplier_item_mapping_required/);
  assert.match(sql, /finished_good_not_purchased/);
  assert.match(sql, /IF v_po_status IN \('draft', 'changes_requested'\)/);
  assert.match(sql, /NEW\.status IN \('sent', 'approved', 'partially_received'\)/);
  assert.match(sql, /central_supply_ops/);
  assert.match(sql, /central_kitchen_lead/);
  assert.match(sql, /'procurement:po_create'/);
  assert.doesNotMatch(sql, /unit_price/);
  assert.doesNotMatch(sql, /send_purchase_order/);
  assert.doesNotMatch(sql, /owner_patch_confirmed_grn_unit_cost/);
  assert.doesNotMatch(sql, /DROP TABLE/);

  assert.match(proof, /sent PO must have null YCM FK/);
  assert.match(proof, /send must reject unmapped lines/);
  assert.match(proof, /unmapped draft must not Auto-GRN/);
  assert.match(proof, /warehouse send must mint Auto-GRN/);
  assert.match(proof, /branch_manager must be forbidden/);
});

test("Wave 1 orders tab can Tạo đơn while the YCM tab stays usable", () => {
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
  assert.match(page, /canCreate=\{canManagePo && createBranches\.length > 0\}/);
  assert.match(page, /PurchaseRequestsClient/);
  assert.match(page, /canCreateRequest=\{canCreateRequest && requestBranches\.length > 0\}/);
  assert.match(client, /copy\.createAction/);
  assert.match(client, /mode === "create"/);
  assert.match(client, /unmappedSendBlocked/);
  assert.match(form, /variant="document"/);
  assert.match(form, /unmappedLineWarning/);
  assert.match(demand, /savePurchaseDemand/);
  assert.match(copy, /createAction: "Tạo đơn"/);
  assert.match(copy, /needsTab: "Yêu cầu mua"/);
  assert.match(roles, /"central_supply_ops"/);
  assert.match(roles, /"central_kitchen_lead"/);
  assert.doesNotMatch(client, /unitPrice|Đơn giá/);
  assert.doesNotMatch(form, /unitPrice|Đơn giá/);
});
