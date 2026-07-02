import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  getMenuLimitCapSource,
  getMenuLimitEffectiveCap,
  getMenuLimitRemaining,
  hasManualMenuLimit,
  type MenuLimitCapFields,
} from "../app/(protected)/br/[branchId]/(operator)/settings/menu-limits/menu-limit-cap";

function row(patch: Partial<MenuLimitCapFields>): MenuLimitCapFields {
  return {
    limit_quantity: null,
    stock_capacity: null,
    sold_today: 0,
    is_disabled: false,
    ...patch,
  };
}

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
    "app/(protected)/br/[branchId]/(operator)/settings/menu-limits/actions.ts",
  ),
  "utf8",
);

const tableSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/settings/menu-limits/menu-limits-table.tsx",
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

test("Menu-Limits effective cap composes manual and stock caps", () => {
  assert.equal(getMenuLimitEffectiveCap(row({})), null);
  assert.equal(
    getMenuLimitEffectiveCap(row({ limit_quantity: 10, stock_capacity: 4 })),
    4,
  );
  assert.equal(
    getMenuLimitEffectiveCap(row({ limit_quantity: 3, stock_capacity: 8 })),
    3,
  );
  assert.equal(
    getMenuLimitRemaining(row({ stock_capacity: 4, sold_today: 1 })),
    3,
  );
  assert.equal(
    getMenuLimitRemaining(
      row({ stock_capacity: 10, sold_today: 8, available_to_sell: 5 }),
    ),
    2,
  );
  assert.equal(getMenuLimitRemaining(row({ stock_capacity: 0 })), 0);
});

test("Menu-Limits manager remaining follows daily cap instead of live stock", () => {
  assert.equal(
    getMenuLimitRemaining(
      row({
        limit_quantity: 100,
        stock_capacity: 47,
        sold_today: 49,
        available_to_sell: 0,
      }),
    ),
    51,
  );
});

test("stock-backed Menu-Limits rows default Giới hạn bán to Tồn kho", () => {
  assert.equal(hasManualMenuLimit(row({ stock_capacity: 4 })), true);
  assert.equal(hasManualMenuLimit(row({ limit_quantity: 4 })), true);
  assert.equal(hasManualMenuLimit(row({ is_disabled: true })), true);
  assert.equal(getMenuLimitCapSource(row({ stock_capacity: 4 })), "equal");
  assert.equal(
    getMenuLimitCapSource(row({ limit_quantity: 10, stock_capacity: 4 })),
    "stock_lower",
  );
});

test("Menu-Limits admin RPC and UI expose stock_capacity", () => {
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
  assert.match(tableSource, /getDraftLimitQuantity/);
  assert.match(tableSource, /getMenuLimitRemaining/);
  assert.match(tableSource, /getSoldProgress/);
  assert.match(tableSource, /renderRemainingBar/);
  assert.match(
    stockCapacityMigration,
    /limit_quantity\s+=\s+COALESCE\([\s\S]*branch_menu_item_daily_limits\.limit_quantity[\s\S]*EXCLUDED\.limit_quantity/,
  );
});

test("Menu-Limits manager must set Giới hạn bán between 0 and Tồn kho", () => {
  const limitQuantitySchemaSource =
    actionsSource.match(/limitQuantity:[\s\S]*?isDisabled:/)?.[0] ?? "";

  assert.match(tableSource, /parsed > row\.stock_capacity/);
  assert.match(tableSource, /manualLimitExceedsStock/);
  assert.match(tableSource, /manualLimitRequired/);
  assert.match(tableSource, /manualLimitRange/);
  assert.match(tableSource, /stockCapacityRequired/);
  assert.match(tableSource, /max=\{row\.stock_capacity \?\? 9999\}/);
  assert.match(tableSource, /min=\{0\}/);
  assert.match(tableSource, /required/);
  assert.match(tableSource, /manualLimitPlaceholder/);
  assert.match(limitQuantitySchemaSource, /\.min\(0/);
  assert.doesNotMatch(limitQuantitySchemaSource, /\.positive\(/);
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

test("stock capacity compute converts recipe entry units to base", () => {
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

test("Recipes page passes ingredient unit options to recipe editor", () => {
  assert.match(recipesPageSource, /units\?: IngredientUnitRow\[\]/);
  assert.match(recipesPageSource, /units: i\.units/);
});

test("POS stock-control blocks items without computed stock capacity", () => {
  assert.match(
    stockCapacityMultiUnitMigration,
    /WHEN r\.stock_capacity_live IS NULL AND p_stock_outcome_enabled THEN 0/,
  );
  assert.match(
    stockCapacityMultiUnitMigration,
    /a\.limit_id IS NOT NULL\s+OR ctx\.stock_outcome_enabled/,
  );
});

test("Menu-Limits RPC exposes availability components", () => {
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

test("Menu-Limits availability computes live stock when daily row is missing", () => {
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

test("Menu-Limits manager copy uses stock availability vocabulary", () => {
  assert.match(posMessagesSource, /stockCapacityLabel: "Tồn kho"/);
  assert.match(posMessagesSource, /manualLimitLabel: "Giới hạn bán"/);
  assert.match(posMessagesSource, /manualLimitPlaceholder: "Nhập số"/);
  assert.match(
    posMessagesSource,
    /manualLimitRequired: "Giới hạn bán là bắt buộc\."/,
  );
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

test("Menu-Limits manager table uses four requested columns and sold bar", () => {
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
