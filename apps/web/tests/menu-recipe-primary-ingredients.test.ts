import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { formatMenuRecipeBomSummary } from "../app/(protected)/inventory/_lib/menu-recipe-cost";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260827010000_recipe_primary_ingredients.sql");

const adr0047 = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../docs/plan/adr/0047-recipe-primary-ingredients-and-sellable-capacity.md",
  ),
  "utf8",
);

test("ADR 0047 documents multi-primary ingredients and sellable capacity semantics", () => {
  assert.match(adr0047, /# ADR 0047 — Recipe Primary Ingredients and Sellable Stock Capacity/);
  assert.match(adr0047, /Multi-Primary Ingredient Flag \(`is_primary`\)/);
  assert.match(adr0047, /Shared Physical Ingredient Demand Accounting/);
  assert.match(adr0047, /Full Recipe Post-Sale Consumption & Food Cost/);
});

test("migration adds is_primary column to public.recipes", () => {
  assertSqlMatch(migration, /ALTER TABLE public\.recipes\s+ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false NOT NULL;/);
  assertSqlMatch(migration, /COMMENT ON COLUMN public\.recipes\.is_primary IS/);
});

test("migration updates upsert_recipe_lines to preserve is_primary and return { menu_item_id, kept_count }", () => {
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.upsert_recipe_lines/);
  assertSqlMatch(migration, /v_is_primary := CASE\s+WHEN v_line \? 'is_primary' THEN \(v_line ->> 'is_primary'\)::boolean/);
  assertSqlMatch(migration, /is_primary = coalesce\(v_is_primary, recipes\.is_primary, false\)/);
  assertSqlMatch(migration, /'menu_item_id',\s+p_menu_item_id/);
  assertSqlMatch(migration, /'kept_count',\s+coalesce\(array_length\(v_kept, 1\), 0\)/);
});

test("migration updates branch_menu_limit_availability with primary ingredient capacity and all-lines demand aggregation", () => {
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.branch_menu_limit_availability/);
  assertSqlMatch(migration, /all_recipe_lines AS \(/);
  assertSqlMatch(migration, /primary_recipe_lines AS \(/);
  assertSqlMatch(migration, /pending_ingredient AS \([\s\S]*?JOIN all_recipe_lines/);
  assertSqlMatch(migration, /holds_ingredient AS \([\s\S]*?JOIN all_recipe_lines/);
  assertSqlMatch(migration, /stock_pool AS \([\s\S]*?LEFT JOIN primary_recipe_lines/);
});

test("migration updates enforce_branch_stock_availability to gate on primary ingredients and isolate unit conversion checks", () => {
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.enforce_branch_stock_availability/);
  assertSqlMatch(migration, /item_primary_flags AS \(/);
  assertSqlMatch(migration, /bool_or\(r\.is_primary\) AS has_primary/);
  assertSqlMatch(migration, /\(r\.is_primary = true OR COALESCE\(ipf\.has_primary, false\) = false\)/);
  // Verify unit conversion check is scoped to the primary recipe line itself, avoiding broken cross-line NOT EXISTS
  assertSqlMatch(migration, /AND \(\s*r\.entry_unit_id IS NULL\s*OR EXISTS \(\s*SELECT 1\s*FROM public\.ingredient_units iu/);
});

test("migration updates compute_menu_item_stock_capacity", () => {
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.compute_menu_item_stock_capacity/);
  assertSqlMatch(migration, /item_primary_flags AS \(/);
  assertSqlMatch(migration, /\(r\.is_primary = true OR COALESCE\(ipf\.has_primary, false\) = false\)/);
});

test("formatMenuRecipeBomSummary marks primary ingredients with (chính)", () => {
  assert.equal(
    formatMenuRecipeBomSummary([
      { ingredientName: "Sườn cốt lết", qty: 1, unitLabel: "miếng", isPrimary: true },
      { ingredientName: "Gạo tấm", qty: 150, unitLabel: "g", isPrimary: true },
      { ingredientName: "Dưa leo", qty: 30, unitLabel: "g", isPrimary: false },
    ]),
    "Sườn cốt lết (chính) 1 miếng · Gạo tấm (chính) 150 g · Dưa leo 30 g",
  );
});
