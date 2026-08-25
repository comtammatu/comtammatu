import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("ADR 0040 PO lines carry supplier_id and confirm books one NCC on a shared GRN", () => {
  const sql = read(
    "supabase/migrations/20260820122811_po_line_supplier_shared_grn.sql",
  );
  const proof = read(
    "supabase/tests/multi_supplier_po_shared_grn_test.sql",
  );
  const wave4 = read(
    "supabase/migrations/20260820123758_wave4_revoke_ycm_ych_write.sql",
  );

  assert.match(sql, /purchase_order_items[\s\S]*supplier_id bigint/);
  assert.match(sql, /ALTER COLUMN supplier_id DROP NOT NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS confirmed_at timestamptz/);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.confirm_goods_receipt_note\(\s*p_grn_id bigint,\s*p_supplier_id bigint DEFAULT NULL/,
  );
  assert.match(sql, /grn_supplier_confirm_required/);
  assert.match(sql, /item\.confirmed_at IS NULL/);
  assert.match(sql, /save_supplier_invoice_draft_unchecked missing/);
  assert.match(sql, /grn_item\.confirmed_at IS NOT NULL/);
  assert.match(sql, /drop unconfirmed GRN lines/);
  assert.match(sql, /LEFT JOIN public\.suppliers supplier/);
  assert.doesNotMatch(sql, /invoice_reprice/);

  assert.match(proof, /mixed PO header supplier must be null/);
  assert.match(proof, /confirm A must leave shared GRN draft/);
  assert.match(proof, /confirm A must not stock B/);
  assert.match(proof, /confirm B must close shared GRN/);
  assert.match(proof, /invoice A must not allocate B/);

  assert.match(wave4, /REVOKE ALL ON FUNCTION public\.save_purchase_demand/);
  assert.match(wave4, /REVOKE ALL ON FUNCTION public\.save_stock_request/);
  assert.doesNotMatch(wave4, /REVOKE ALL ON FUNCTION public\.close_stock_request/);
  assert.doesNotMatch(wave4, /DROP TABLE/);
});

test("ADR 0040 UI is ingredient-first and confirms GRN by NCC", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const form = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-order-form-dialog.tsx",
  );
  const grnActions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const hook = read("apps/web/lib/inventory/use-grn-detail-actions.ts");
  const copy = read("apps/web/lib/messages/inventory.ts");
  const errors = read("apps/web/lib/messages/inventory-rpc-errors.ts");

  assert.match(actions, /supplierId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(actions, /supplier_id: line\.supplierId/);
  assert.match(actions, /p_supplier_id: supplierId \?\? null/);
  assert.match(form, /matchingSuppliersForIngredient/);
  assert.match(form, /multiSupplierPreview/);
  assert.doesNotMatch(form, /selectSupplierFirst/);
  assert.match(
    grnActions,
    /export async function confirmGrn\(\s*grnId: number,\s*supplierId\?: number \| null/,
  );
  assert.match(grnActions, /p_supplier_id: supplier\.data \?\? null/);
  assert.match(grnActions, /\.in\("status", \["confirmed", "draft"\]\)/);
  assert.match(grnActions, /sourcePo\?\.id \?\? headerPoId/);
  assert.match(hook, /handleConfirmGrn: \(supplierId\?: number \| null\)/);
  assert.match(copy, /confirmSupplierAction:/);
  assert.match(copy, /multiSupplierBadge: "Nhiều NCC"/);
  assert.match(copy, /bookedLine: "Đã nhận"/);
  assert.match(errors, /grn_supplier_confirm_required/);
  const invoices = read(
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  assert.match(invoices, /matchingGrns\.length === 1/);
});
