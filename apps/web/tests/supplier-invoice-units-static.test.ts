import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const webRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(webRoot, "../..");

const grnActions = readFileSync(
  resolve(webRoot, "app/(protected)/inventory/grn-actions.ts"),
  "utf8",
);
const invoiceRow = readFileSync(
  resolve(webRoot, "app/(protected)/finance/supplier-invoices/supplier-invoice-row.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260822170000_fix_supplier_invoice_unit_matching.sql",
  ),
  "utf8",
);

test("grn-actions fetches PO item units and safely unpacks array/object embeds for invoice dropdown", () => {
  // Verifies that PO item entry unit is queried
  assert.match(
    grnActions,
    /purchase_order_items:purchase_order_items!grn_items_purchase_order_item_tenant_fkey\s*\(\s*id,\s*entry_unit_id,\s*units!purchase_order_items_entry_unit_id_fkey\s*\(\s*id,\s*code,\s*name\s*\)\s*\)/,
  );

  // Verifies that relatedOne helper is used to unpack potential array/object embeds
  assert.match(grnActions, /function relatedOne/);
  assert.match(grnActions, /relatedOne\(line\.purchase_order_items\)/);
  assert.match(grnActions, /relatedOne\(line\.units\)/);
  assert.match(grnActions, /relatedOne\(line\.ingredients\)/);

  // Verifies that unit ID and label prioritize the PO entry unit matching po_applied_quantity
  assert.match(grnActions, /poItem\?\.entry_unit_id/);
  assert.match(grnActions, /poUnit\?\.name/);
  assert.match(grnActions, /grnUnit\?\.name/);
});

test("supplier-invoice-row safely parses trimmed unit and ingredient display names", () => {
  assert.match(invoiceRow, /unit\.name\.trim\(\)/);
  assert.match(invoiceRow, /ingredient\.name\.trim\(\)/);
});

test("migration allows invoice lines to match either PO entry unit or GRN entry unit", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.save_supplier_invoice_draft_unchecked/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.apply_supplier_invoice_matching/,
  );
  assert.match(
    migration,
    /line\.unit_id IS DISTINCT FROM coalesce\(po_item\.entry_unit_id, grn_item\.entry_unit_id\)\s+AND line\.unit_id IS DISTINCT FROM grn_item\.entry_unit_id/,
  );
  assert.match(
    migration,
    /invoice_line\.unit_id IS DISTINCT FROM coalesce\(po_item\.entry_unit_id, grn_item\.entry_unit_id\)\s+AND invoice_line\.unit_id IS DISTINCT FROM grn_item\.entry_unit_id/,
  );
});
