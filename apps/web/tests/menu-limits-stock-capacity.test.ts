import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260629164000_menu_limits_stock_capacity_admin_list.sql",
  ),
  "utf8",
);

const stockCapacityMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260629100001_menu_stock_capacity_daily_limit.sql",
  ),
  "utf8",
);

const stockCapacityMultiUnitMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260630083000_menu_stock_capacity_multiunit.sql",
  ),
  "utf8",
);

const actionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
  ),
  "utf8",
);

const tableSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
  ),
  "utf8",
);

const recipesPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/recipes/page.tsx"),
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

const stockOutcomeAvailabilityMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260630071000_pos_kds_inventory_truth_g2_availability.sql",
  ),
  "utf8",
);

const liveStockCapacityMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260701181757_menu_limits_live_stock_capacity.sql",
  ),
  "utf8",
);

const unlimitedWhenDeductionOffMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260703150000_menu_limit_availability_unlimited_when_deduction_off.sql",
  ),
  "utf8",
);

const baselineSource = readFileSync(
  join(process.cwd(), "../../supabase/migrations/00000000000000_baseline.sql"),
  "utf8",
);

test.skip("Menu-Limits admin RPC and UI expose stock_capacity", () => {
  assert.match(
    migration,
    /RETURNS TABLE\([\s\S]*stock_capacity integer[\s\S]*\)/,
  );
  assert.match(migration, /bl\.stock_capacity/);
  assert.match(
    migration,
    /stock_capacity IS NOT NULL[\s\S]*RETURN jsonb_build_object/,
  );
  assert.match(actionsSource, /stock_capacity: number \| null/);
  assert.match(tableSource, /stockCapacityLabel/);
  assert.match(tableSource, /manual_limit_quantity/);
  assert.match(tableSource, /getSoldProgress/);
  assert.match(tableSource, /renderRemainingBar/);
  assert.match(
    stockCapacityMigration,
    /limit_quantity\s+=\s+COALESCE\([\s\S]*branch_menu_item_daily_limits\.limit_quantity[\s\S]*EXCLUDED\.limit_quantity/,
  );
});

test.skip("Menu-Limits manager saves raw manual limit; empty input clears without client block", () => {
  const limitQuantitySchemaSource =
    actionsSource.match(/limitQuantity:[\s\S]*?isDisabled:/)?.[0] ?? "";

  // Client no longer clamps the input to stock capacity or blocks on empty.
  assert.doesNotMatch(tableSource, /parsed > row\.stock_capacity/);
  assert.doesNotMatch(tableSource, /manualLimitExceedsStock/);
  assert.doesNotMatch(tableSource, /manualLimitRequired/);
  assert.doesNotMatch(tableSource, /stockCapacityRequired/);
  assert.doesNotMatch(tableSource, /max=\{row\.stock_capacity/);
  assert.match(tableSource, /manualLimitRange/);
  assert.match(tableSource, /manualLimitPlaceholder/);
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
  assert.match(
    readFileSync(
      join(
        process.cwd(),
        "../../supabase/migrations/_archive/20260630062650_pos_kds_inventory_truth_g1_access.sql",
      ),
      "utf8",
    ),
    /CHECK \(limit_quantity IS NULL OR limit_quantity >= 0\)[\s\S]*compute_menu_item_stock_capacity[\s\S]*stock capacity required[\s\S]*COALESCE\(p_limit_quantity, v_stock_capacity\)[\s\S]*v_limit_quantity > v_stock_capacity[\s\S]*limit quantity exceeds stock capacity/,
  );
  assert.match(
    stockOutcomeAvailabilityMigration,
    /COALESCE\(bl\.limit_quantity, bl\.stock_capacity\) AS limit_quantity/,
  );
});

test.skip("Menu-Limits clear-limit button is wired", () => {
  assert.match(tableSource, /clearBranchMenuDailyLimit/);
  assert.match(tableSource, /messages\.pos\.menu\.clearLimit/);
});

test.skip("stock capacity compute converts recipe entry units to base", () => {
  assert.match(
    stockCapacityMultiUnitMigration,
    /LEFT JOIN public\.ingredient_units iu[\s\S]*iu\.unit_id = r\.entry_unit_id/,
  );
  assert.match(
    stockCapacityMultiUnitMigration,
    /ELSE \(r\.quantity \/ r\.yield_factor\) \* iu\.to_base_factor/,
  );
  assert.match(
    stockCapacityMultiUnitMigration,
    /BOOL_OR\([\s\S]*line_missing_config[\s\S]*per_portion_qty <= 0[\s\S]*\) THEN NULL::integer/,
  );
});

test.skip("Recipes page passes ingredient unit options to recipe editor", () => {
  assert.match(recipesPageSource, /units\?: IngredientUnitRow\[\]/);
  assert.match(recipesPageSource, /units: i\.units/);
});

test.skip("POS stock-control blocks items without computed stock capacity", () => {
  assert.match(
    stockCapacityMultiUnitMigration,
    /WHEN r\.stock_capacity_live IS NULL AND p_stock_outcome_enabled THEN 0/,
  );
  assert.match(
    stockCapacityMultiUnitMigration,
    /a\.limit_id IS NOT NULL\s+OR ctx\.stock_outcome_enabled/,
  );
});

test.skip("Menu-Limits RPC exposes availability components", () => {
  assert.match(
    stockOutcomeAvailabilityMigration,
    /stock_capacity_live integer/,
  );
  assert.match(
    stockOutcomeAvailabilityMigration,
    /manual_limit_quantity integer/,
  );
  assert.match(stockOutcomeAvailabilityMigration, /accepted_today integer/);
  assert.match(
    stockOutcomeAvailabilityMigration,
    /pending_unfinalized_demand integer/,
  );
  assert.match(stockOutcomeAvailabilityMigration, /active_hold_demand integer/);
  assert.match(stockOutcomeAvailabilityMigration, /available_to_sell integer/);
  assert.match(actionsSource, /available_to_sell: number \| null/);
});

test.skip("Menu-Limits availability computes live stock when daily row is missing", () => {
  assert.match(
    liveStockCapacityMigration,
    /CREATE OR REPLACE FUNCTION public\.branch_menu_limit_availability/,
  );
  assert.match(
    liveStockCapacityMigration,
    /compute_menu_item_stock_capacity\(\s*p_tenant_id,\s*p_branch_id,\s*mi\.id\s*\)/,
  );
  assert.match(
    liveStockCapacityMigration,
    /COALESCE\(bl\.limit_quantity, sc\.stock_capacity\) AS limit_quantity/,
  );
  assert.match(
    liveStockCapacityMigration,
    /sc\.stock_capacity AS stock_capacity_live/,
  );
  assert.doesNotMatch(
    liveStockCapacityMigration,
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

test.skip("Menu-Limits availability sells freely when stock-outcome deduction is off", () => {
  assert.match(
    unlimitedWhenDeductionOffMigration,
    /CREATE OR REPLACE FUNCTION public\.branch_menu_limit_availability/,
  );

  const stockRemaining = unlimitedWhenDeductionOffMigration.match(
    /CASE\s+WHEN NOT p_stock_outcome_enabled THEN NULL::integer[\s\S]*?END AS stock_remaining,/,
  )?.[0] ?? "";

  // Deduction OFF: unlimited (NULL) regardless of recipe/live stock — manual
  // cap alone gates sales via manual_remaining.
  assert.match(stockRemaining, /WHEN NOT p_stock_outcome_enabled THEN NULL::integer/);
  // Deduction ON: unchanged stock-capped behavior (no recipe -> 0, else capacity - pending - hold).
  assert.match(stockRemaining, /WHEN r\.stock_capacity_live IS NULL THEN 0/);
  assert.match(
    stockRemaining,
    /ELSE r\.stock_capacity_live - r\.pending_unfinalized_demand - r\.active_hold_demand/,
  );
  assert.doesNotMatch(
    unlimitedWhenDeductionOffMigration,
    /r\.stock_capacity_live - r\.accepted_today - r\.active_hold_demand/,
  );

  // Manual cap computation and final composition are untouched by this fix.
  assert.match(
    unlimitedWhenDeductionOffMigration,
    /WHEN r\.manual_limit_quantity IS NULL THEN NULL::integer[\s\S]*ELSE r\.manual_limit_quantity - r\.accepted_today - r\.active_hold_demand/,
  );
  assert.match(
    unlimitedWhenDeductionOffMigration,
    /WHEN c\.is_disabled THEN 0[\s\S]*WHEN c\.stock_remaining IS NULL AND c\.manual_remaining IS NULL THEN NULL[\s\S]*WHEN c\.stock_remaining IS NULL THEN GREATEST\(0, c\.manual_remaining\)[\s\S]*WHEN c\.manual_remaining IS NULL THEN GREATEST\(0, c\.stock_remaining\)[\s\S]*ELSE GREATEST\(0, LEAST\(c\.stock_remaining, c\.manual_remaining\)\)/,
  );
});

test.skip("Menu-Limits availability fix is mirrored in the baseline", () => {
  assert.match(
    baselineSource,
    /CREATE FUNCTION public\.branch_menu_limit_availability[\s\S]*?WHEN NOT p_stock_gate_enabled THEN NULL::integer\s+WHEN r\.stock_capacity IS NULL THEN NULL::integer\s+ELSE r\.stock_capacity - r\.pending_unfinalized_demand - r\.active_hold_demand\s+END AS stock_remaining/,
  );
  assert.doesNotMatch(
    baselineSource,
    /r\.stock_capacity_live - r\.accepted_today - r\.active_hold_demand/,
  );
});

test.skip("Menu-Limits manager table uses four requested columns and sold bar", () => {
  assert.match(
    tableSource,
    /key: "item"[\s\S]*key: "stockCapacity"[\s\S]*key: "limit"[\s\S]*key: "remaining"/,
  );
  assert.doesNotMatch(tableSource, /key: "status"/);
  assert.doesNotMatch(tableSource, /key: "disabled"/);
  assert.doesNotMatch(tableSource, /key: "actions"/);
  assert.match(tableSource, /messages\.pos\.menu\.soldCount\(progress\.sold\)/);
  assert.match(
    tableSource,
    /messages\.pos\.menu\.remainingCount\(progress\.remaining\)/,
  );
  assert.match(tableSource, /tone="destructive"/);
});
