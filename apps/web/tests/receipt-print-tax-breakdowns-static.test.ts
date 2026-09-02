import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsRoot = path.join(repoRoot, "supabase", "migration-archive");

function readMigrationBySuffix(suffix: string): string {
  const filename = readdirSync(migrationsRoot).find((candidate) =>
    candidate.endsWith(suffix),
  );
  assert.ok(filename, `${suffix} migration must exist`);
  return readFileSync(path.join(migrationsRoot, filename), "utf8");
}

test("receipt print migration builds tax_breakdowns from _compute_vat_breakdown", () => {
  const migration = readMigrationBySuffix("_receipt_print_tax_breakdowns.sql");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.bill_tax_breakdowns\(p_order_id bigint\)/,
  );
  assert.match(migration, /_compute_vat_breakdown\(ARRAY\[p_order_id\]\)/);
  assert.match(migration, /ORDER BY vat\.vat_rate DESC/);
});

test("enqueue receipt and provisional bill attach tax_breakdowns to payload", () => {
  const migration = readMigrationBySuffix("_receipt_print_tax_breakdowns.sql");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.enqueue_provisional_bill/,
  );
  assert.match(
    migration,
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

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.materialize_print_document/,
  );
  assert.match(
    migration,
    /WHEN 'totals' THEN[\s\S]*'tax_breakdowns',\s*COALESCE\(p_payload->'tax_breakdowns', '\[\]'::jsonb\)/,
  );
});

test("receipt print VAT amounts round to whole VND like Sinvoice", () => {
  const migration = readMigrationBySuffix(
    "_receipt_print_vat_round_whole_vnd.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.bill_tax_breakdowns\(p_order_id bigint\)/,
  );
  assert.match(migration, /ROUND\(vat\.line_gross, 0\)/);
  assert.match(
    migration,
    /ROUND\(vat\.line_gross \/ \(1 \+ vat\.vat_rate \/ 100\.0\), 0\)/,
  );
  assert.match(migration, /rounded\.amount > 0/);
  assert.doesNotMatch(
    migration,
    /'amount',\s*vat\.line_vat/,
    "print helper must not emit unrounded 2dp residual VAT",
  );
});
