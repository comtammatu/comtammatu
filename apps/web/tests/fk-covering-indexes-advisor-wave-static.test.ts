import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260728174910_fk_covering_indexes_advisor_wave.sql",
  ),
  "utf8",
);

test("FK covering wave discovers public foreign keys without a leftmost index", () => {
  assert.match(migration, /c\.contype = 'f'/);
  assert.match(migration, /n\.nspname = 'public'/);
  assert.match(
    migration,
    /ix\.index_columns\[1:cardinality\(f\.columns\)\] = f\.columns/,
  );
});

test("FK covering wave creates indexes idempotently", () => {
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS %I ON public\.%I \(%s\)/,
  );
  assert.match(migration, /fk covering index wave: created_or_ensured/);
});
