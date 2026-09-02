import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, looksLikeDump } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("ADR 0040 GRN book price migration drops PO estimates and stops invoice reprice", () => {
  const sql = read(
    "supabase/migrations/20260818121714_grn_book_unit_price_drop_po_est.sql",
  );
  if (looksLikeDump(sql)) return;

  assertSqlMatch(sql, /GRANT SELECT \(unit_cost, total_cost\)/);
  assertSqlMatch(sql, /GRANT INSERT \(unit_cost\)/);
  assertSqlMatch(sql, /GRANT UPDATE \(unit_cost\)/);
  assertSqlMatch(sql, /unit_cost_unit_id/);
  assertSqlMatch(sql,
    /DISABLE TRIGGER trg_grn_items_linked_immutability[\s\S]*ENABLE TRIGGER trg_grn_items_linked_immutability/,
  );
  assertSqlMatch(sql, /p\.prokind = 'f'/);
  assert.ok(
    sql.includes(String.raw`replace(replace(v_def, E'\r\n', E'\n')`),
  );
  assertSqlMatch(sql, /private\.grn_line_book_total/);
  assertSqlMatch(sql, /grn_unit_price_unit_required/);
  assertSqlNotMatch(sql,
    /\(NEW\.received_quantity - NEW\.rejected_quantity\) \* NEW\.unit_cost/,
  );
  assertSqlMatch(sql, /provisional_cost_source := 'grn_receipt'/);
  assertSqlMatch(sql, /grn_unit_price_required/);
  assertSqlMatch(sql, /'status', 'ap_only'/);
  assertSqlMatch(sql, /DROP COLUMN IF EXISTS unit_price_est/);
  assertSqlMatch(sql, /DROP COLUMN IF EXISTS line_total/);
  assertSqlNotMatch(sql, /NEW\.unit_cost := 0/);
});

test("ADR 0040 auto-GRN drafts stay unpriced until warehouse books unit cost", () => {
  const sql = read(
    "supabase/migrations/20260818221612_grn_draft_unpriced_until_warehouse_books.sql",
  );
  const proof = read("supabase/tests/grn_book_unit_price_test.sql");
  const demandProof = read(
    "supabase/tests/purchase_demand_allocation_workflow_test.sql",
  );

  assertSqlMatch(sql, /private\.ensure_grn_draft_for_po/);
  assertSqlNotMatch(sql, /avg_unit_cost/);
  assertSqlNotMatch(sql, /ingredient\.unit_cost/);
  assertSqlMatch(sql, /provisional_cost_source/);
  assertSqlMatch(sql, /'pending'/);
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
