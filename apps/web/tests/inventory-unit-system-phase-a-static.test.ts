import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) =>
  readSql(repoRoot, path);

const migration = readRepo(
  "supabase/migrations/20260703160000_inventory_unit_system_phase_a.sql",
);
const baseline = normalizePgDumpSql(
  readRepo("supabase/migrations/20260902162918_baseline.sql"),
);

test("Phase A migration adds the two-tier unit schema additively", () => {
  for (const expected of [
    "ADD COLUMN IF NOT EXISTS dimension text NULL",
    "ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT false",
    "ADD COLUMN IF NOT EXISTS standard_factor numeric(18,9) NULL",
    "CHECK (dimension IS NULL OR dimension IN ('mass', 'volume'))",
    "ADD COLUMN IF NOT EXISTS anchor_unit_id bigint NULL REFERENCES public.units (id) ON DELETE RESTRICT",
    "ADD COLUMN IF NOT EXISTS anchor_factor numeric(18,9) NULL",
    "CHECK (anchor_factor IS NULL OR anchor_factor > 0)",
  ]) {
    assertSqlMatch(migration, expected, `expected ${expected}`);
  }
});

test("Phase A migration seeds standard mass/volume units with locked factors", () => {
  for (const expected of [
    "('g',  'Gam',        'mass',   1::numeric)",
    "('kg', 'Ki-lô-gam',  'mass',   1000::numeric)",
    "('mg', 'Mi-li-gam',  'mass',   0.001::numeric)",
    "('ml', 'Mi-li-lít',  'volume', 1::numeric)",
    "('l',  'Lít',        'volume', 1000::numeric)",
    "('cl', 'Xen-ti-lít', 'volume', 10::numeric)",
  ]) {
    assertSqlMatch(migration, expected, `expected standard seed row ${expected}`,
    );
  }
});

test("Phase A migration normalizes stale unit codes and seeds packaging units", () => {
  assertSqlMatch(migration, /WHERE lower\(code\) = 'lit'/);
  assertSqlMatch(migration, /WHERE lower\(code\) = 'bich'/);
  assertSqlMatch(migration, /WHERE lower\(code\) = 'piece'/);
  for (const packagingCode of [
    "bao",
    "thùng",
    "chai",
    "lon",
    "hũ",
    "hộp",
    "gói",
    "túi",
    "lốc",
    "khay",
    "vỉ",
    "trái",
    "cái",
  ]) {
    assertSqlMatch(migration, `('${packagingCode}'`, `expected packaging seed for ${packagingCode}`,
    );
  }
});

test("Phase A migration backfills existing ingredient_units rows into the anchor model", () => {
  assertSqlMatch(migration,
    /UPDATE public\.ingredient_units iu\s+SET anchor_unit_id = base\.unit_id,\s+anchor_factor = iu\.to_base_factor/,
  );
  assertSqlMatch(migration, /base\.is_base = true/);
  assertSqlMatch(migration, /iu\.is_base = false/);
  assertSqlMatch(migration, /iu\.anchor_unit_id IS NULL/);
  assertSqlMatch(migration,
    /NOT EXISTS \(\s*SELECT 1 FROM public\.units u\s+WHERE u\.id = iu\.unit_id[\s\S]*?u\.is_standard = true/,
    "backfill must skip rows whose own unit is a standard unit (ratio comes from standard_factor, not an anchor)",
  );
});

test("inv_derive_to_base_factor is fail-closed and ACL-locked in the same migration", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.inv_derive_to_base_factor/,
  );
  for (const errorToken of [
    "base_unit_not_found",
    "unit_not_found",
    "standard_unit_dimension_mismatch",
    "packaging_unit_requires_anchor",
    "anchor_unit_not_found",
    "unit_anchor_cycle",
  ]) {
    assertSqlMatch(migration, errorToken, `expected fail-closed error ${errorToken}`,
    );
  }
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) FROM PUBLIC/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) TO authenticated, service_role/,
  );
  assertSqlMatch(migration,
    /v_tenant\s+bigint := public\.auth_tenant_id\(\)/,
    "tenant must come from auth_tenant_id(), never a caller-supplied parameter",
  );
});

test("Phase A migration grants a dedicated units-master permission", () => {
  assertSqlMatch(migration,
    /INSERT INTO public\.permission_keys \(key, module, description, scope\) VALUES\s+\('inventory:units_master', 'inventory',/,
  );
  assertSqlMatch(migration, /ON CONFLICT \(key\) DO NOTHING/);
  assertSqlMatch(migration,
    /position_code IN \('owner', 'warehouse_manager', 'production_manager'\)/,
  );
});

test("units and ingredient_units column additions are mirrored into the baseline", () => {
  const unitsTable = baseline.match(
    /CREATE TABLE public\.units \(([\s\S]*?)\);/,
  );
  assert.ok(unitsTable, "expected CREATE TABLE public.units in baseline");
  assert.match(unitsTable[1], /dimension text/);
  assert.match(unitsTable[1], /is_standard boolean DEFAULT false NOT NULL/);
  assert.match(unitsTable[1], /standard_factor numeric\(18,9\)/);

  const ingredientUnitsTable = baseline.match(
    /CREATE TABLE public\.ingredient_units \(([\s\S]*?)\);/,
  );
  assert.ok(
    ingredientUnitsTable,
    "expected CREATE TABLE public.ingredient_units in baseline",
  );
  assert.match(ingredientUnitsTable[1], /anchor_unit_id bigint/);
  assert.match(ingredientUnitsTable[1], /anchor_factor numeric\(18,9\)/);
});

test("inv_derive_to_base_factor is present in the baseline for a from-empty install", () => {
  assertSqlMatch(baseline, /CREATE FUNCTION public\.inv_derive_to_base_factor/);
  assertSqlMatch(baseline,
    /GRANT (?:EXECUTE|ALL) ON FUNCTION public\.inv_derive_to_base_factor\(/,
  );
});

test("inv_to_base is unchanged by Phase A (signature and body untouched)", () => {
  assertSqlNotMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.inv_to_base\(/,
  );
});
