import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { formatMenuRecipeBomSummary } from "../app/(protected)/inventory/_lib/menu-recipe-cost";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migration-archive/20260827010000_recipe_primary_ingredients.sql",
  ),
  "utf8",
);

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
  assert.match(migration, /ALTER TABLE public\.recipes\s+ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false NOT NULL;/);
  assert.match(migration, /COMMENT ON COLUMN public\.recipes\.is_primary IS/);
});

test("migration updates upsert_recipe_lines to preserve is_primary and return { menu_item_id, kept_count }", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.upsert_recipe_lines/);
  assert.match(migration, /v_is_primary := CASE\s+WHEN v_line \? 'is_primary' THEN \(v_line ->> 'is_primary'\)::boolean/);
  assert.match(migration, /is_primary = coalesce\(v_is_primary, recipes\.is_primary, false\)/);
  assert.match(migration, /'menu_item_id',\s+p_menu_item_id/);
  assert.match(migration, /'kept_count',\s+coalesce\(array_length\(v_kept, 1\), 0\)/);
});

test("migration updates branch_menu_limit_availability with primary ingredient capacity and all-lines demand aggregation", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.branch_menu_limit_availability/);
  assert.match(migration, /all_recipe_lines AS \(/);
  assert.match(migration, /primary_recipe_lines AS \(/);
  assert.match(migration, /pending_ingredient AS \([\s\S]*?JOIN all_recipe_lines/);
  assert.match(migration, /holds_ingredient AS \([\s\S]*?JOIN all_recipe_lines/);
  assert.match(migration, /stock_pool AS \([\s\S]*?LEFT JOIN primary_recipe_lines/);
});

test("migration updates enforce_branch_stock_availability to gate on primary ingredients and isolate unit conversion checks", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_branch_stock_availability/);
  assert.match(migration, /item_primary_flags AS \(/);
  assert.match(migration, /bool_or\(r\.is_primary\) AS has_primary/);
  assert.match(migration, /\(r\.is_primary = true OR COALESCE\(ipf\.has_primary, false\) = false\)/);
  // Verify unit conversion check is scoped to the primary recipe line itself, avoiding broken cross-line NOT EXISTS
  assert.match(migration, /AND \(\s*r\.entry_unit_id IS NULL\s*OR EXISTS \(\s*SELECT 1\s*FROM public\.ingredient_units iu/);
});

test("migration updates compute_menu_item_stock_capacity", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.compute_menu_item_stock_capacity/);
  assert.match(migration, /item_primary_flags AS \(/);
  assert.match(migration, /\(r\.is_primary = true OR COALESCE\(ipf\.has_primary, false\) = false\)/);
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
