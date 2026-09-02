import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260629164000_menu_limits_stock_capacity_admin_list.sql");

const stockCapacityMigration = readSql(process.cwd(), "supabase/migrations/20260629100001_menu_stock_capacity_daily_limit.sql");

const stockCapacityMultiUnitMigration = readSql(process.cwd(), "supabase/migrations/20260630083000_menu_stock_capacity_multiunit.sql");

const actionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
  ),
  "utf8",
);

const drawerSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/_components/home/branch-quick-menu-limit-sheet.tsx",
  ),
  "utf8",
);

const recipesPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/menu-recipes/page.tsx"),
  "utf8",
);

const posMessagesSource = readFileSync(
  join(process.cwd(), "lib/messages/pos.ts"),
  "utf8",
);

const settingsMessagesSource = readFileSync(
  join(process.cwd(), "lib/messages/settings.ts"),
  "utf8",
);

const stockOutcomeAvailabilityMigration = readSql(process.cwd(), "supabase/migrations/20260630071000_pos_kds_inventory_truth_g2_availability.sql");

const liveStockCapacityMigration = readSql(process.cwd(), "supabase/migrations/20260701181757_menu_limits_live_stock_capacity.sql");

const unlimitedWhenDeductionOffMigration = readSql(process.cwd(), "supabase/migrations/20260703150000_menu_limit_availability_unlimited_when_deduction_off.sql");

const baselineSource = readSql(process.cwd(), "supabase/migrations/20260902162918_baseline.sql");

test.skip("Menu-Limits admin RPC and UI expose stock_capacity", () => {
  assertSqlMatch(migration,
    /RETURNS TABLE\([\s\S]*stock_capacity integer[\s\S]*\)/,
  );
  assertSqlMatch(migration, /bl\.stock_capacity/);
  assertSqlMatch(migration,
    /stock_capacity IS NOT NULL[\s\S]*RETURN jsonb_build_object/,
  );
  assert.match(actionsSource, /stock_capacity: number \| null/);
  assert.match(drawerSource, /stockCapacityLabel/);
  assert.match(drawerSource, /manual_limit_quantity/);
  assert.match(drawerSource, /getSoldProgress/);
  assert.match(drawerSource, /renderRemainingBar/);
  assertSqlMatch(stockCapacityMigration,
    /limit_quantity\s+=\s+COALESCE\([\s\S]*branch_menu_item_daily_limits\.limit_quantity[\s\S]*EXCLUDED\.limit_quantity/,
  );
});

test.skip("Menu-Limits manager saves raw manual limit; empty input clears without client block", () => {
  const limitQuantitySchemaSource =
    actionsSource.match(/limitQuantity:[\s\S]*?isDisabled:/)?.[0] ?? "";

  // Client no longer clamps the input to stock capacity or blocks on empty.
  assert.doesNotMatch(drawerSource, /parsed > row\.stock_capacity/);
  assert.doesNotMatch(drawerSource, /manualLimitExceedsStock/);
  assert.doesNotMatch(drawerSource, /manualLimitRequired/);
  assert.doesNotMatch(drawerSource, /stockCapacityRequired/);
  assert.doesNotMatch(drawerSource, /max=\{row\.stock_capacity/);
  assert.match(drawerSource, /manualLimitRange/);
  assert.match(drawerSource, /manualLimitPlaceholder/);
  assert.match(limitQuantitySchemaSource, /\.min\(0/);
  assert.doesNotMatch(limitQuantitySchemaSource, /\.positive\(/);

  // Server-side substring mappings still exist (M2 removes them) — keep the
  // Vietnamese copy wired until the migration lands.
  assert.match(
    actionsSource,
    /msg\.includes\("exceeds stock capacity"\)[\s\S]*Giới hạn bán không được vượt Tồn kho/,
  );
  assert.match(
    actionsSource,
    /msg\.includes\("stock capacity required"\)[\s\S]*Chưa tính được Tồn kho/,
  );
  assertSqlMatch(readSql(process.cwd(), "supabase/migrations/20260630062650_pos_kds_inventory_truth_g1_access.sql"),
    /CHECK \(limit_quantity IS NULL OR limit_quantity >= 0\)[\s\S]*compute_menu_item_stock_capacity[\s\S]*stock capacity required[\s\S]*COALESCE\(p_limit_quantity, v_stock_capacity\)[\s\S]*v_limit_quantity > v_stock_capacity[\s\S]*limit quantity exceeds stock capacity/,
  );
  assertSqlMatch(stockOutcomeAvailabilityMigration,
    /COALESCE\(bl\.limit_quantity, bl\.stock_capacity\) AS limit_quantity/,
  );
});

test("Menu-Limits empty cap input clears the manual cap", () => {
  assert.match(drawerSource, /function parseLimitDraft/);
  assert.match(drawerSource, /if \(trimmed === ""\) return null;/);
  assert.match(drawerSource, /limitQuantity: parsed/);
  assert.match(drawerSource, /onValueBlur/);
  assert.match(actionsSource, /nullableLimitQuantitySchema/);
  assert.match(actionsSource, /Do not z\.coerce\.number\(\)/);
  const limitQuantitySchemaSource =
    actionsSource.match(
      /const nullableLimitQuantitySchema = z\.preprocess\([\s\S]*?isDisabled:/,
    )?.[0] ?? "";
  assert.match(limitQuantitySchemaSource, /z\.null\(\)/);
  assert.doesNotMatch(limitQuantitySchemaSource, /z\.coerce/);
});

test("stock capacity compute converts recipe entry units to base", () => {
  assertSqlMatch(stockCapacityMultiUnitMigration,
    /LEFT JOIN public\.ingredient_units iu[\s\S]*iu\.unit_id = r\.entry_unit_id/,
  );
  assertSqlMatch(stockCapacityMultiUnitMigration,
    /ELSE \(r\.quantity \/ r\.yield_factor\) \* iu\.to_base_factor/,
  );
  assertSqlMatch(stockCapacityMultiUnitMigration,
    /BOOL_OR\([\s\S]*line_missing_config[\s\S]*per_portion_qty <= 0[\s\S]*\) THEN NULL::integer/,
  );
});

test("Menu recipes page passes ingredient unit options to menu recipe editor", () => {
  assert.match(recipesPageSource, /units\?: IngredientUnitRow\[\]/);
  assert.match(recipesPageSource, /units: i\.units/);
});

test("POS stock-control blocks items without computed stock capacity", () => {
  assertSqlMatch(stockCapacityMultiUnitMigration,
    /WHEN r\.stock_capacity_live IS NULL AND p_stock_outcome_enabled THEN 0/,
  );
  assertSqlMatch(stockCapacityMultiUnitMigration,
    /a\.limit_id IS NOT NULL\s+OR ctx\.stock_outcome_enabled/,
  );
});

test("Menu-Limits RPC exposes availability components", () => {
  assertSqlMatch(stockOutcomeAvailabilityMigration,
    /stock_capacity_live integer/,
  );
  assertSqlMatch(stockOutcomeAvailabilityMigration,
    /manual_limit_quantity integer/,
  );
  assertSqlMatch(stockOutcomeAvailabilityMigration, /accepted_today integer/);
  assertSqlMatch(stockOutcomeAvailabilityMigration,
    /pending_unfinalized_demand integer/,
  );
  assertSqlMatch(stockOutcomeAvailabilityMigration, /active_hold_demand integer/);
  assertSqlMatch(stockOutcomeAvailabilityMigration, /available_to_sell integer/);
  assert.match(actionsSource, /available_to_sell: number \| null/);
});

test("Menu-Limits availability computes live stock when daily row is missing", () => {
  assertSqlMatch(liveStockCapacityMigration,
    /CREATE OR REPLACE FUNCTION public\.branch_menu_limit_availability/,
  );
  assertSqlMatch(liveStockCapacityMigration,
    /compute_menu_item_stock_capacity\(\s*p_tenant_id,\s*p_branch_id,\s*mi\.id\s*\)/,
  );
  assertSqlMatch(liveStockCapacityMigration,
    /COALESCE\(bl\.limit_quantity, sc\.stock_capacity\) AS limit_quantity/,
  );
  assertSqlMatch(liveStockCapacityMigration,
    /sc\.stock_capacity AS stock_capacity_live/,
  );
  assertSqlNotMatch(liveStockCapacityMigration,
    /bl\.stock_capacity AS stock_capacity_live/,
  );
});

test.skip("Menu-Limits manager copy uses stock availability vocabulary", () => {
  assert.match(posMessagesSource, /stockCapacityLabel: "Tồn kho"/);
  assert.match(posMessagesSource, /manualLimitLabel: "Giới hạn bán"/);
  assert.match(posMessagesSource, /manualLimitPlaceholder: "Nhập số"/);
  assert.match(
    posMessagesSource,
    /manualLimitRange: "Giới hạn bán phải là số nguyên từ 0 đến 9999\."/,
  );
  assert.match(
    posMessagesSource,
    /stockCapacityRequired: "Chưa tính được Tồn kho/,
  );
  assert.match(posMessagesSource, /soldLabel: "Còn lại"/);
  assert.match(
    posMessagesSource,
    /soldCount: \(quantity: number\) => `\$\{quantity\} đã bán`/,
  );
  assert.match(
    posMessagesSource,
    /remainingCount: \(quantity: number\) => `\$\{quantity\} còn lại`/,
  );
  assert.match(settingsMessagesSource, /menuLimitsTitle: "Giới hạn bán"/);
  assert.doesNotMatch(posMessagesSource, /Trần thủ công|Phần bán được/);
});

test("Menu-Limits availability sells freely when stock-outcome deduction is off", () => {
  assertSqlMatch(unlimitedWhenDeductionOffMigration,
    /CREATE OR REPLACE FUNCTION public\.branch_menu_limit_availability/,
  );

  assertSqlMatch(
    unlimitedWhenDeductionOffMigration,
    /WHEN NOT p_stock_outcome_enabled THEN NULL::integer/,
  );
  assertSqlMatch(
    unlimitedWhenDeductionOffMigration,
    /WHEN r\.stock_capacity_live IS NULL THEN 0/,
  );
  assertSqlMatch(
    unlimitedWhenDeductionOffMigration,
    /ELSE r\.stock_capacity_live - r\.pending_unfinalized_demand - r\.active_hold_demand/,
  );
  assertSqlNotMatch(unlimitedWhenDeductionOffMigration,
    /r\.stock_capacity_live - r\.accepted_today - r\.active_hold_demand/,
  );

  // Manual cap computation and final composition are untouched by this fix.
  assertSqlMatch(unlimitedWhenDeductionOffMigration,
    /WHEN r\.manual_limit_quantity IS NULL THEN NULL::integer[\s\S]*ELSE r\.manual_limit_quantity - r\.accepted_today - r\.active_hold_demand/,
  );
  assertSqlMatch(unlimitedWhenDeductionOffMigration,
    /WHEN c\.is_disabled THEN 0[\s\S]*WHEN c\.stock_remaining IS NULL AND c\.manual_remaining IS NULL THEN NULL[\s\S]*WHEN c\.stock_remaining IS NULL THEN GREATEST\(0, c\.manual_remaining\)[\s\S]*WHEN c\.manual_remaining IS NULL THEN GREATEST\(0, c\.stock_remaining\)[\s\S]*ELSE GREATEST\(0, LEAST\(c\.stock_remaining, c\.manual_remaining\)\)/,
  );
});

test.skip("Menu-Limits availability fix is mirrored in the baseline", () => {
  assertSqlMatch(baselineSource,
    /CREATE FUNCTION public\.branch_menu_limit_availability[\s\S]*?WHEN NOT p_stock_gate_enabled THEN NULL::integer\s+WHEN r\.stock_capacity IS NULL THEN NULL::integer\s+ELSE r\.stock_capacity - r\.pending_unfinalized_demand - r\.active_hold_demand\s+END AS stock_remaining/,
  );
  assertSqlNotMatch(baselineSource,
    /r\.stock_capacity_live - r\.accepted_today - r\.active_hold_demand/,
  );
});

test.skip("Menu-Limits manager table uses four requested columns and sold bar", () => {
  assert.match(
    drawerSource,
    /key: "item"[\s\S]*key: "stockCapacity"[\s\S]*key: "limit"[\s\S]*key: "remaining"/,
  );
  assert.doesNotMatch(drawerSource, /key: "status"/);
  assert.doesNotMatch(drawerSource, /key: "disabled"/);
  assert.doesNotMatch(drawerSource, /key: "actions"/);
  assert.match(drawerSource, /messages\.pos\.menu\.soldCount\(progress\.sold\)/);
  assert.match(
    drawerSource,
    /messages\.pos\.menu\.remainingCount\(progress\.remaining\)/,
  );
  assert.match(drawerSource, /tone="destructive"/);
});
