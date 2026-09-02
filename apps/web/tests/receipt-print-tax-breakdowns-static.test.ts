import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = path.resolve(import.meta.dirname, "../../..");
const _migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readMigrationBySuffix(_suffix: string): string {
  return readActiveMigrationSql(repoRoot);
}

test("receipt print migration builds tax_breakdowns from _compute_vat_breakdown", () => {
  const migration = readMigrationBySuffix("_receipt_print_tax_breakdowns.sql");

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.bill_tax_breakdowns\(p_order_id bigint\)/,
  );
  assertSqlMatch(migration, /_compute_vat_breakdown\(ARRAY\[p_order_id\]\)/);
  assertSqlMatch(migration, /ORDER BY vat\.vat_rate DESC/);
});

test("enqueue receipt and provisional bill attach tax_breakdowns to payload", () => {
  const migration = readMigrationBySuffix("_receipt_print_tax_breakdowns.sql");

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.enqueue_provisional_bill/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.enqueue_receipt_print/,
  );
  assert.equal(
    (migration.match(/v_tax_breakdowns := public\.bill_tax_breakdowns\(p_order_id\)/g) ?? [])
      .length,
    2,
    "both bill enqueue RPCs must call bill_tax_breakdowns",
  );
  assert.equal(
    (migration.match(/'tax_breakdowns',\s*COALESCE\(v_tax_breakdowns, '\[\]'::jsonb\)/g) ?? [])
      .length,
    2,
    "both bill enqueue RPCs must put tax_breakdowns on the payload",
  );
});

test("SQL materialize passes tax_breakdowns into totals blocks", () => {
  const migration = readMigrationBySuffix("_receipt_print_tax_breakdowns.sql");

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.materialize_print_document/,
  );
  assertSqlMatch(migration,
    /WHEN 'totals' THEN[\s\S]*'tax_breakdowns',\s*COALESCE\(p_payload->'tax_breakdowns', '\[\]'::jsonb\)/,
  );
});

test("receipt print VAT amounts round to whole VND like Sinvoice", () => {
  const migration = readMigrationBySuffix(
    "_receipt_print_vat_round_whole_vnd.sql",
  );

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.bill_tax_breakdowns\(p_order_id bigint\)/,
  );
  assertSqlMatch(migration, /ROUND\(vat\.line_gross, 0\)/);
  assertSqlMatch(migration,
    /ROUND\(vat\.line_gross \/ \(1 \+ vat\.vat_rate \/ 100\.0\), 0\)/,
  );
  assertSqlMatch(migration, /rounded\.amount > 0/);
  assertSqlNotMatch(migration,
    /'amount',\s*vat\.line_vat/,
    "print helper must not emit unrounded 2dp residual VAT",
  );
});
