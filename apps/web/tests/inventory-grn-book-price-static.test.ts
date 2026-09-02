import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("ADR 0040 GRN book price migration drops PO estimates and stops invoice reprice", () => {
  const sql = read(
    "supabase/migration-archive/20260818121714_grn_book_unit_price_drop_po_est.sql",
  );

  assert.match(sql, /GRANT SELECT \(unit_cost, total_cost\)/);
  assert.match(sql, /GRANT INSERT \(unit_cost\)/);
  assert.match(sql, /GRANT UPDATE \(unit_cost\)/);
  assert.match(sql, /unit_cost_unit_id/);
  assert.match(
    sql,
    /DISABLE TRIGGER trg_grn_items_linked_immutability[\s\S]*ENABLE TRIGGER trg_grn_items_linked_immutability/,
  );
  assert.match(sql, /p\.prokind = 'f'/);
  assert.ok(
    sql.includes(String.raw`replace(replace(v_def, E'\r\n', E'\n')`),
  );
  assert.match(sql, /private\.grn_line_book_total/);
  assert.match(sql, /grn_unit_price_unit_required/);
  assert.doesNotMatch(
    sql,
    /\(NEW\.received_quantity - NEW\.rejected_quantity\) \* NEW\.unit_cost/,
  );
  assert.match(sql, /provisional_cost_source := 'grn_receipt'/);
  assert.match(sql, /grn_unit_price_required/);
  assert.match(sql, /'status', 'ap_only'/);
  assert.match(sql, /DROP COLUMN IF EXISTS unit_price_est/);
  assert.match(sql, /DROP COLUMN IF EXISTS line_total/);
  assert.doesNotMatch(sql, /NEW\.unit_cost := 0/);
});

test("ADR 0040 auto-GRN drafts stay unpriced until warehouse books unit cost", () => {
  const sql = read(
    "supabase/migration-archive/20260818221612_grn_draft_unpriced_until_warehouse_books.sql",
  );
  const proof = read("supabase/tests/grn_book_unit_price_test.sql");
  const demandProof = read(
    "supabase/tests/purchase_demand_allocation_workflow_test.sql",
  );

  assert.match(sql, /private\.ensure_grn_draft_for_po/);
  assert.doesNotMatch(sql, /avg_unit_cost/);
  assert.doesNotMatch(sql, /ingredient\.unit_cost/);
  assert.match(sql, /provisional_cost_source/);
  assert.match(sql, /'pending'/);
  assert.match(
    proof,
    /auto-GRN drafts must stay unpriced until warehouse books/,
  );
  assert.match(demandProof, /25000/);
  assert.match(
    demandProof,
    /GRN draft must stay unpriced until warehouse books/,
  );
});

test("ADR 0040 SQL proof covers PO drop, GRN unit_cost grants, and AP-only invoice", () => {
  const proof = read("supabase/tests/grn_book_unit_price_test.sql");
  assert.match(proof, /PO estimate columns must be dropped/);
  assert.match(proof, /warehouse must read\/write grn_items.unit_cost/);
  assert.match(proof, /warehouse must read\/write grn_items.unit_cost_unit_id/);
  assert.match(proof, /invoice settlement must stay AP-only/);
  assert.match(proof, /confirm must require unit_cost/);
});
