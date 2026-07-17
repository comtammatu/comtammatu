import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8");

const migration = readRepo(
  "supabase/migration-archive/20260703170000_units_canonical_hardening.sql",
);
const baseline = normalizePgDumpSql(
  readRepo("supabase/migrations/20260716093507_baseline.sql"),
);

test("hardening migration self-heals name to mirror code", () => {
  assert.match(
    migration,
    /UPDATE public\.units\s+SET name = code\s+WHERE name IS DISTINCT FROM code;/,
  );
});

test("hardening migration re-accents stripped packaging codes collision-safe", () => {
  for (const pair of [
    "('goi', 'gói')",
    "('thung', 'thùng')",
    "('trai', 'trái')",
    "('vi', 'vỉ')",
  ]) {
    assert.ok(migration.includes(pair), `expected re-accent pair ${pair}`);
  }
  assert.match(
    migration,
    /NOT EXISTS \(\s*SELECT 1 FROM public\.units existing[\s\S]*?existing\.code = v\.accented\s*\)/,
    "re-accent must be guarded against colliding with an existing accented row",
  );
});

test("hardening migration normalizes the recipe serving unit", () => {
  assert.match(
    migration,
    /UPDATE public\.recipes\s+SET unit = 'cái'\s+WHERE unit = 'piece';/,
  );
});

test("hardening migration adds the lowercase code constraint idempotently", () => {
  assert.match(migration, /conname = 'units_code_lowercase_chk'/);
  assert.match(
    migration,
    /ADD CONSTRAINT units_code_lowercase_chk CHECK \(code = lower\(code\)\)/,
  );
  assert.match(
    migration,
    /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/,
    "constraint add must be DO-guarded for replay-idempotency",
  );
});

test("lowercase code constraint is mirrored into the baseline units table", () => {
  const unitsTable = baseline.match(
    /CREATE TABLE public\.units \(([\s\S]*?)\);/,
  );
  assert.ok(unitsTable, "expected CREATE TABLE public.units in baseline");
  assert.match(
    unitsTable[1],
    /CONSTRAINT units_code_lowercase_chk CHECK \(\(code = lower\(code\)\)\)/,
  );
});
