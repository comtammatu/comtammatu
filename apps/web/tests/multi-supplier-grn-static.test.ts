import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260729180000_purchase_request_po_first_grn_ap.sql",
);
const duplicateIngredientMigration = read(
  "supabase/migrations/20260729190000_allow_duplicate_ingredient_grn_lines.sql",
);
const secureLinkedLineTriggerMigration = read(
  "supabase/migrations/20260729200000_secure_linked_grn_line_trigger.sql",
);
const secureSupplierInvoiceMigration = read(
  "supabase/migrations/20260729210000_secure_supplier_invoice_allocation_rpc.sql",
);
const supplierAllocationLockMigration = read(
  "supabase/migrations/20260729220000_fix_supplier_allocation_locks.sql",
);
const linkedGrnPricingMigration = read(
  "supabase/migrations/20260729230000_price_linked_grn_applied_quantity.sql",
);
const grnDraftMetricsMigration = read(
  "supabase/migrations/20260729240000_fix_grn_draft_exception_metrics.sql",
);

test("new GRNs belong to one supplier PO while legacy multi-supplier rows remain", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_grn_draft_from_po/);
  assert.match(migration, /v_po\.supplier_id/);
  assert.match(migration, /goods_received_notes_po_active_draft_uidx/);
  assert.match(migration, /creation_idempotency_key IS NULL/);
  assert.match(migration, /confirm_goods_receipt_note_legacy/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION[\s\S]*create_purchase_orders_from_grn[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});

test("request items can become separate paid and zero-price PO lines", () => {
  assert.match(migration, /DROP CONSTRAINT IF EXISTS[\s\S]*purchase_order_items_po_id_ingredient_id_tenant_id_key/);
  assert.match(migration, /unit_price_est IS NULL[\s\S]*unit_price_est < 0/);
  assert.doesNotMatch(migration, /unit_price_est <= 0/);
  assert.match(migration, /purchase_request_item_id/);
  assert.match(
    duplicateIngredientMigration,
    /DROP CONSTRAINT IF EXISTS grn_items_grn_id_ingredient_id_tenant_id_key/,
  );
  assert.match(
    secureLinkedLineTriggerMigration,
    /ALTER FUNCTION private\.enforce_linked_grn_line_immutability\(\)\s+SECURITY DEFINER/,
  );
});

test("receipt confirmation splits applied quantity and zero-value excess", () => {
  assert.match(migration, /v_applied := least\(v_accepted, v_remaining\)/);
  assert.match(migration, /v_excess := greatest\(v_accepted - v_remaining, 0\)/);
  assert.match(migration, /po_applied_quantity = v_applied/);
  assert.match(
    migration,
    /v_excess_base,[\s\S]*'GRN ' \|\| v_grn\.grn_number \|\| ' excess'[\s\S]*p_grn_id,[\s\S]*0,/,
  );
  assert.match(
    linkedGrnPricingMigration,
    /NEW\.po_applied_quantity[\s\S]*NEW\.unit_cost/,
  );
  assert.match(
    grnDraftMetricsMigration,
    /WHEN grn\.status = 'confirmed'[\s\S]*ELSE item\.received_quantity - item\.rejected_quantity[\s\S]*> remaining\.quantity/,
  );
});

test("supplier invoices, payments, and credits use explicit allocations", () => {
  assert.match(migration, /CREATE TABLE public\.supplier_invoice_receipt_allocations/);
  assert.match(migration, /CREATE TABLE public\.supplier_payment_allocations/);
  assert.match(migration, /CREATE TABLE public\.supplier_credit_allocations/);
  assert.match(migration, /create_supplier_invoice_with_allocations/);
  assert.match(migration, /record_supplier_payment_allocated/);
  assert.match(migration, /create_supplier_credit_allocated/);
  assert.match(migration, /unallocated_amount/);
  assert.match(
    secureSupplierInvoiceMigration,
    /SECURITY DEFINER[\s\S]*has_permission_any\('procurement:invoice_create'\)/,
  );
  assert.doesNotMatch(
    supplierAllocationLockMigration,
    /JOIN \(\s*SELECT DISTINCT[\s\S]*FOR UPDATE/,
  );
  assert.match(
    supplierAllocationLockMigration,
    /JOIN jsonb_array_elements\(p_allocations\) allocation[\s\S]*FOR UPDATE OF invoice/,
  );
});
