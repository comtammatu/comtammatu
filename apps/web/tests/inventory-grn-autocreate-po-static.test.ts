import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/20260708131412_grn_confirm_autocreate_po.sql",
);
const grnLineActions = readRepo(
  "apps/web/app/(protected)/inventory/grn/[id]/_hooks/use-grn-line-actions.ts",
);

test("confirm_goods_receipt_note creates a PO only for PO-less GRNs with accepted stock", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.confirm_goods_receipt_note\(p_grn_id bigint\)/,
  );
  assert.match(migration, /IF v_grn\.po_id IS NULL AND EXISTS \(/);
  assert.match(
    migration,
    /gi\.quality_status <> 'rejected'[\s\S]*gi\.received_quantity - COALESCE\(gi\.rejected_quantity, 0\) > 0/,
  );
  assert.match(
    migration,
    /INSERT INTO public\.purchase_orders \([\s\S]*tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by[\s\S]*'sent'/,
  );
});

test("auto-created PO lines mirror net accepted GRN quantities and prices", () => {
  assert.match(
    migration,
    /INSERT INTO public\.purchase_order_items \([\s\S]*tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total/,
  );
  assert.match(
    migration,
    /\(gi\.received_quantity - COALESCE\(gi\.rejected_quantity, 0\)\)::numeric\(15,3\)/,
  );
  assert.match(migration, /gi\.entry_unit_id,[\s\S]*gi\.unit_cost/);
  assert.match(
    migration,
    /ROUND\(\(gi\.received_quantity - COALESCE\(gi\.rejected_quantity, 0\)\) \* gi\.unit_cost, 2\)/,
  );
  assert.match(
    migration,
    /SET po_quantity = gi\.received_quantity - COALESCE\(gi\.rejected_quantity, 0\),[\s\S]*po_unit_price = gi\.unit_cost/,
  );
});

test("confirmed GRN is linked to the generated PO before PO status derivation", () => {
  assert.match(
    migration,
    /v_po_id := COALESCE\(v_grn\.po_id, v_created_po_id\);/,
  );
  assert.match(
    migration,
    /SET status = 'confirmed', po_id = v_po_id, updated_at = now\(\)/,
  );
  assert.match(
    migration,
    /WHERE id = v_po_id AND tenant_id = v_tenant[\s\S]*FOR UPDATE;/,
  );
  assert.match(migration, /WHERE poi\.po_id = v_po_id/);
  assert.match(migration, /WHERE g\.po_id = v_po_id/);
  assert.match(migration, /'po_id', v_po_id/);
  assert.match(migration, /'auto_po_created', v_created_po_id IS NOT NULL/);
});

test("desktop GRN confirm navigation follows the PO returned by the RPC", () => {
  assert.match(grnLineActions, /const confirmedPoId =/);
  assert.match(
    grnLineActions,
    /\(res\.data as \{ po_id\?: number \| null \}\)\.po_id/,
  );
  assert.match(
    grnLineActions,
    /router\.push\(`\$\{purchaseOrdersBasePath\}\/\$\{confirmedPoId\}`\)/,
  );
  assert.doesNotMatch(grnLineActions, /else if \(grn\.poId\)/);
});
