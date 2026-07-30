import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

const migration = readRoot(
  "supabase/migrations/20260730100000_auto_grn_draft_queue.sql",
);

test("receivable PO status creates one active GRN draft", () => {
  assert.match(migration, /CREATE TRIGGER ensure_grn_draft_after_po_status/);
  assert.match(migration, /NEW\.status IN \('sent', 'partially_received'\)/);
  assert.match(
    migration,
    /purchase_order\.\*[\s\S]*FOR UPDATE[\s\S]*grn\.status = 'draft'/,
  );
  assert.match(migration, /DO \$\$[\s\S]*purchase_order\.status IN/);
});
