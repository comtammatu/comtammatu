import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test("D088 confirm GRN fail-closed without approved PO", () => {
  const migration = read(
    "supabase/migrations/20260728141000_d088_grn_po_confirm_gate.sql",
  );
  assert.match(migration, /grn_confirm_requires_approved_po/);
  assert.match(migration, /'sent', 'partially_received'/);
  assert.match(migration, /create_purchase_order_from_grn/);
  assert.doesNotMatch(
    migration,
    /auto_po_created|IF v_grn\.po_id IS NULL AND EXISTS/,
  );
});

test("D088 create PO from GRN action and messages exist", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const messages = read("apps/web/lib/messages/inventory.ts");
  const grnActions = read(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );
  assert.match(actions, /createPurchaseOrderFromGrn/);
  assert.match(actions, /PO_MUTATE_ROLES/);
  assert.match(messages, /confirmRequiresApprovedPo/);
  assert.match(messages, /createPoFromGrnAction/);
  assert.match(grnActions, /grn_confirm_requires_approved_po/);
});
