import assert from "node:assert/strict";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, looksLikeDump } from "./_lib/active-sql.ts";

const ingredientGateRemovalMigration = readSql(process.cwd(), "supabase/migrations/20260705140000_ingredient_gate_removal.sql");

const slimFieldsMigration = readSql(process.cwd(), "supabase/migrations/20260705141000_menu_availability_slim_fields.sql");

test("ingredient gate removal: trigger, functions, and flag row are dropped", () => {
  assertSqlMatch(ingredientGateRemovalMigration,
    /DROP TRIGGER trg_enforce_ingredient_stock ON public\.order_items;/,
  );
  assertSqlMatch(ingredientGateRemovalMigration,
    /DROP FUNCTION public\.enforce_branch_ingredient_stock\(\);/,
  );
  assertSqlMatch(ingredientGateRemovalMigration,
    /DROP FUNCTION public\.get_branch_menu_ingredient_caps_for_pos\(bigint\);/,
  );
  assertSqlMatch(ingredientGateRemovalMigration,
    /DELETE FROM public\.branch_feature_flags WHERE flag_key = 'pos_ingredient_stock_block';/,
  );
});

test("branch_menu_limit_availability: RETURNS TABLE drops accepted_today, stock_capacity_live, and limit_quantity", () => {
  if (looksLikeDump(ingredientGateRemovalMigration) || looksLikeDump(slimFieldsMigration)) return;
  const signature =
    slimFieldsMigration.match(
      /CREATE FUNCTION public\.branch_menu_limit_availability\([^)]*\) RETURNS TABLE\(([^)]*)\)/,
    )?.[1] ?? "";

  assert.doesNotMatch(signature, /accepted_today/);
  assert.doesNotMatch(signature, /stock_capacity_live/);
  assert.doesNotMatch(signature, /\blimit_quantity\b/);
  assert.match(signature, /\bmanual_limit_quantity\b/);
  assert.match(signature, /\bsold_today\b/);
  assert.match(signature, /\bstock_capacity\b/);
  assert.match(signature, /\bavailable_to_sell\b/);
});

test("get_branch_menu_daily_limits_for_pos: POS variant is the slim subset (no item_name/category/base_price/limit_date/limit_id)", () => {
  if (looksLikeDump(ingredientGateRemovalMigration) || looksLikeDump(slimFieldsMigration)) return;
  const signature =
    slimFieldsMigration.match(
      /CREATE FUNCTION public\.get_branch_menu_daily_limits_for_pos\([^)]*\) RETURNS TABLE\(([^)]*)\)/,
    )?.[1] ?? "";

  assert.doesNotMatch(signature, /accepted_today/);
  assert.doesNotMatch(signature, /stock_capacity_live/);
  assert.doesNotMatch(signature, /\blimit_quantity\b/);
  assert.doesNotMatch(signature, /item_name/);
  assert.doesNotMatch(signature, /category_id/);
  assert.doesNotMatch(signature, /base_price/);
  assert.match(signature, /\bmanual_limit_quantity\b/);
  assert.match(signature, /\bavailable_to_sell\b/);
});

test("list_branch_menu_daily_limits: manager RETURNS TABLE drops the same three fields, DROP+CREATE (not CREATE OR REPLACE)", () => {
  if (looksLikeDump(ingredientGateRemovalMigration) || looksLikeDump(slimFieldsMigration)) return;
  assertSqlMatch(slimFieldsMigration,
    /DROP FUNCTION public\.list_branch_menu_daily_limits\(bigint, date\);/,
  );

  const signature =
    slimFieldsMigration.match(
      /CREATE FUNCTION public\.list_branch_menu_daily_limits\([^)]*\) RETURNS TABLE\(([^)]*)\)/,
    )?.[1] ?? "";

  assert.doesNotMatch(signature, /accepted_today/);
  assert.doesNotMatch(signature, /stock_capacity_live/);
  assert.doesNotMatch(signature, /\blimit_quantity\b/);
  assert.match(signature, /\bmanual_limit_quantity\b/);
  assert.match(signature, /\bitem_name\b/);

  // DROP+CREATE (not CREATE OR REPLACE) needs explicit GRANT reissue —
  // Postgres wipes prior grants on DROP.
  assertSqlMatch(slimFieldsMigration,
    /GRANT ALL ON FUNCTION public\.list_branch_menu_daily_limits\(p_branch_id bigint, p_limit_date date\) TO service_role;/,
  );
  assertSqlMatch(slimFieldsMigration,
    /GRANT ALL ON FUNCTION public\.list_branch_menu_daily_limits\(p_branch_id bigint, p_limit_date date\) TO authenticated;/,
  );
});

test("stock-capacity refresh triggers and their functions are dropped; column stays (additive-only)", () => {
  assertSqlMatch(slimFieldsMigration,
    /DROP TRIGGER trg_refresh_menu_stock_capacity_on_recipe ON public\.recipes;/,
  );
  assertSqlMatch(slimFieldsMigration,
    /DROP TRIGGER trg_refresh_menu_stock_capacity_on_stock ON public\.stock_levels;/,
  );
  assertSqlMatch(slimFieldsMigration,
    /DROP FUNCTION public\.trg_refresh_menu_stock_capacity_on_recipe\(\);/,
  );
  assertSqlMatch(slimFieldsMigration,
    /DROP FUNCTION public\.trg_refresh_menu_stock_capacity_on_stock\(\);/,
  );
  assertSqlMatch(slimFieldsMigration,
    /DROP FUNCTION public\.refresh_branch_menu_stock_capacity\(bigint, bigint, bigint, bigint\);/,
  );
  assertSqlNotMatch(slimFieldsMigration, /DROP COLUMN.*stock_capacity/);
  assertSqlMatch(slimFieldsMigration,
    /COMMENT ON COLUMN public\.branch_menu_item_daily_limits\.stock_capacity IS/,
  );
});
