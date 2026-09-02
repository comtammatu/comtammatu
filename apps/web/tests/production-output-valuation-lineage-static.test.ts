import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, sqlIndexOf, looksLikeDump } from "./_lib/active-sql.ts";


const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readSql(repoRoot, path);

const MIGRATION =
  "supabase/migrations/20260824004731_restore_production_output_valuation_lineage.sql";

test("ADR 0044 keeps a dedicated production_output valuation branch", () => {
  const sql = read(MIGRATION);

  // Branch coverage guard: the universal shortfall rewrite dropped the
  // production branch and misposted outputs as stocktake gains.
  assertSqlMatch(sql, /ELSIF NEW\.type = 'production_output' THEN/);
  assertSqlMatch(sql, /ELSIF NEW\.quantity_change > 0 THEN/);
  const branchAt = sqlIndexOf(sql, "ELSIF NEW.type = 'production_output' THEN");
  const genericAt = sqlIndexOf(sql, "ELSIF NEW.quantity_change > 0 THEN");
  assert.ok(
    branchAt !== -1 && genericAt !== -1 && branchAt < genericAt,
    "production_output branch must run before the generic positive branch",
  );

  assertSqlMatch(sql, /'production_output',\s*\n\s*NEW\.id,\s*\n\s*NULL,\s*\n\s*v_quantity,/);
  assertSqlMatch(sql, /derived_origin_id,/);
  assertSqlMatch(sql, /SET quantity = 0,\s*\n\s*book_value = 0,/);
});

test("ADR 0044 backfill reclassifies misposted outputs without restating value", () => {
  const sql = read(MIGRATION);
  if (looksLikeDump(sql)) return;

  assertSqlMatch(sql, /SET source_kind = 'production_output'/);
  assertSqlMatch(sql, /SET event_type = 'production_output'/);
  assertSqlMatch(sql, /AND movement\.type = 'production_output'/);
  // Reclassification must stay collision-safe against existing origins.
  assertSqlMatch(sql, /AND NOT EXISTS \(/);
  // Drained holders record lineage instead of silently dropping value.
  assertSqlMatch(sql, /'production_inventory'/);
  // No account book-value restatement in the repair: every valuation
  // account update stays a relative assignment.
  const accountUpdates =
    sql.match(
      /UPDATE public\.inventory_valuation_accounts[\s\S]*?WHERE id = v_account\.id;/g,
    ) ?? [];
  assert.ok(accountUpdates.length > 0, "valuation account updates expected");
  for (const update of accountUpdates) {
    assert.doesNotMatch(update, /SET[\s\S]*?=\s*\d/);
  }
});
