import { join } from "node:path";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = join(process.cwd(), "../..");
const read = (path: string) => readSql(root, path);
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
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.create_grn_draft_from_po/);
  assertSqlMatch(migration, /v_po\.supplier_id/);
  assertSqlMatch(migration, /goods_received_notes_po_active_draft_uidx/);
  assertSqlMatch(migration, /creation_idempotency_key IS NULL/);
  assertSqlMatch(migration, /confirm_goods_receipt_note_legacy/);
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION[\s\S]*create_purchase_orders_from_grn[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});

test("request items can become separate paid and zero-price PO lines", () => {
  assertSqlMatch(migration, /DROP CONSTRAINT IF EXISTS[\s\S]*purchase_order_items_po_id_ingredient_id_tenant_id_key/);
  assertSqlMatch(migration, /unit_price_est IS NULL[\s\S]*unit_price_est < 0/);
  assertSqlNotMatch(migration, /unit_price_est <= 0/);
  assertSqlMatch(migration, /purchase_request_item_id/);
  assertSqlMatch(duplicateIngredientMigration,
    /DROP CONSTRAINT IF EXISTS grn_items_grn_id_ingredient_id_tenant_id_key/,
  );
  assertSqlMatch(secureLinkedLineTriggerMigration,
    /ALTER FUNCTION private\.enforce_linked_grn_line_immutability\(\)\s+SECURITY DEFINER/,
  );
});

test("receipt confirmation splits applied quantity and zero-value excess", () => {
  assertSqlMatch(migration, /v_applied := least\(v_accepted, v_remaining\)/);
  assertSqlMatch(migration, /v_excess := greatest\(v_accepted - v_remaining, 0\)/);
  assertSqlMatch(migration, /po_applied_quantity = v_applied/);
  assertSqlMatch(migration,
    /v_excess_base,[\s\S]*'GRN ' \|\| v_grn\.grn_number \|\| ' excess'[\s\S]*p_grn_id,[\s\S]*0,/,
  );
  assertSqlMatch(linkedGrnPricingMigration,
    /NEW\.po_applied_quantity[\s\S]*NEW\.unit_cost/,
  );
  assertSqlMatch(grnDraftMetricsMigration,
    /WHEN grn\.status = 'confirmed'[\s\S]*ELSE item\.received_quantity - item\.rejected_quantity[\s\S]*> remaining\.quantity/,
  );
});

test("supplier invoices, payments, and credits use explicit allocations", () => {
  assertSqlMatch(migration, /CREATE TABLE public\.supplier_invoice_receipt_allocations/);
  assertSqlMatch(migration, /CREATE TABLE public\.supplier_payment_allocations/);
  assertSqlMatch(migration, /CREATE TABLE public\.supplier_credit_allocations/);
  assertSqlMatch(migration, /create_supplier_invoice_with_allocations/);
  assertSqlMatch(migration, /record_supplier_payment_allocated/);
  assertSqlMatch(migration, /create_supplier_credit_allocated/);
  assertSqlMatch(migration, /unallocated_amount/);
  assertSqlMatch(secureSupplierInvoiceMigration,
    /SECURITY DEFINER[\s\S]*has_permission_any\('procurement:invoice_create'\)/,
  );
  assertSqlNotMatch(supplierAllocationLockMigration,
    /JOIN \(\s*SELECT DISTINCT[\s\S]*FOR UPDATE/,
  );
  assertSqlMatch(supplierAllocationLockMigration,
    /JOIN jsonb_array_elements\(p_allocations\) allocation[\s\S]*FOR UPDATE OF invoice/,
  );
});
