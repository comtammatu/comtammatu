import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8");

const migration = readRepo(
  "supabase/migration-archive/20260703160000_inventory_unit_system_phase_a.sql",
);
const baseline = normalizePgDumpSql(
  readRepo("supabase/migrations/20260727120000_baseline.sql"),
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
    assert.ok(migration.includes(expected), `expected ${expected}`);
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
    assert.ok(
      migration.includes(expected),
      `expected standard seed row ${expected}`,
    );
  }
});

test("Phase A migration normalizes stale unit codes and seeds packaging units", () => {
  assert.match(migration, /WHERE lower\(code\) = 'lit'/);
  assert.match(migration, /WHERE lower\(code\) = 'bich'/);
  assert.match(migration, /WHERE lower\(code\) = 'piece'/);
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
    assert.ok(
      migration.includes(`('${packagingCode}'`),
      `expected packaging seed for ${packagingCode}`,
    );
  }
});

test("Phase A migration backfills existing ingredient_units rows into the anchor model", () => {
  assert.match(
    migration,
    /UPDATE public\.ingredient_units iu\s+SET anchor_unit_id = base\.unit_id,\s+anchor_factor = iu\.to_base_factor/,
  );
  assert.match(migration, /base\.is_base = true/);
  assert.match(migration, /iu\.is_base = false/);
  assert.match(migration, /iu\.anchor_unit_id IS NULL/);
  assert.match(
    migration,
    /NOT EXISTS \(\s*SELECT 1 FROM public\.units u\s+WHERE u\.id = iu\.unit_id[\s\S]*?u\.is_standard = true/,
    "backfill must skip rows whose own unit is a standard unit (ratio comes from standard_factor, not an anchor)",
  );
});

test("inv_derive_to_base_factor is fail-closed and ACL-locked in the same migration", () => {
  assert.match(
    migration,
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
    assert.ok(
      migration.includes(errorToken),
      `expected fail-closed error ${errorToken}`,
    );
  }
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) TO authenticated, service_role/,
  );
  assert.match(
    migration,
    /v_tenant\s+bigint := public\.auth_tenant_id\(\)/,
    "tenant must come from auth_tenant_id(), never a caller-supplied parameter",
  );
});

test("Phase A migration grants a dedicated units-master permission", () => {
  assert.match(
    migration,
    /INSERT INTO public\.permission_keys \(key, module, description, scope\) VALUES\s+\('inventory:units_master', 'inventory',/,
  );
  assert.match(migration, /ON CONFLICT \(key\) DO NOTHING/);
  assert.match(
    migration,
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
  assert.match(baseline, /CREATE FUNCTION public\.inv_derive_to_base_factor/);
  assert.match(
    baseline,
    /GRANT (?:EXECUTE|ALL) ON FUNCTION public\.inv_derive_to_base_factor\(/,
  );
});

test("inv_to_base is unchanged by Phase A (signature and body untouched)", () => {
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.inv_to_base\(/,
  );
});
