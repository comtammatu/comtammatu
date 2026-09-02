import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { readSql, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = process.cwd().replaceAll("\\", "/").includes("apps/web")
  ? join(process.cwd(), "../..")
  : process.cwd();
const read = (path: string) => readSql(root, path);

const migration = read(
  "supabase/migrations/20260822143600_universal_inventory_shortfall_valuation.sql",
);

test("migration adds inventory_shortfall to source_kind constraint", () => {
  assert.match(migration, /'inventory_shortfall'::text/);
});

test("migration synthesizes shortfall for all unbacked negative movements", () => {
  assert.match(migration, /v_source_kind := CASE/);
  assert.match(migration, /'inventory_shortfall'/);
  assert.match(migration, /private\.create_inventory_cost_origin/);
});

test("migration eliminates hard inventory_valuation_insufficient_quantity exception", () => {
  assertSqlNotMatch(migration, /RAISE EXCEPTION 'inventory_valuation_insufficient_quantity'/);
});
