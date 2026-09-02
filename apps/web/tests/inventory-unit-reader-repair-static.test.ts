import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { readSql, assertSqlNotMatch } from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");
const migration = readSql(repoRoot, "supabase/migrations/20260711130000_repair_inventory_unit_readers.sql");
const actions = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  ),
  "utf8",
);

test("inventory readers use the canonical base-unit contract", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.scan_inventory_alerts/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_stock_movement_report/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_stocktake_lines_blind/);
  assertSqlNotMatch(migration, /\bing\.unit\b/);
  assert.match(
    migration,
    /public\.inventory_entry_unit_code\(v_tenant, ing\.id, NULL\)/,
  );
  assert.match(migration, /'inventory\.stock_low'/);
  assert.match(
    migration,
    /ON CONFLICT \(tenant_id, dedup_key\)\s+WHERE dedup_key IS NOT NULL\s+DO NOTHING/,
  );
});

test("recipe entry-unit references cannot be removed silently", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.prevent_recipe_entry_unit_invalidation/,
  );
  assert.match(migration, /FROM public\.recipes r/);
  assert.match(migration, /r\.entry_unit_id = OLD\.unit_id/);
  assert.match(migration, /FROM public\.production_recipes pr/);
  assert.match(
    migration,
    /CREATE TRIGGER trg_prevent_recipe_entry_unit_delete/,
  );
  assert.match(actions, /ingredient_unit_in_use_by_recipe/);
  assert.match(actions, /công thức sản xuất hoặc công thức món/);
});
