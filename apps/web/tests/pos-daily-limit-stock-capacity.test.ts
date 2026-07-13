import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  findDailyLimitBlockForProposal,
  remainingDailyQuotaAfterDemand,
  isDailyLimitBlockedAfterDemand,
} from "../app/(protected)/br/[branchId]/pos/_utils/daily-limit-draft";
import type { MenuItemDailyLimit } from "../app/(protected)/br/[branchId]/pos/pos-menu-types";

function limit(p: Partial<MenuItemDailyLimit>): MenuItemDailyLimit {
  return {
    is_disabled: false,
    sold_today: 0,
    manual_limit_quantity: null,
    available_to_sell: null,
    ...p,
  };
}

const prodBaseline = readFileSync(
  join(process.cwd(), "../../supabase/migrations/00000000000000_baseline.sql"),
  "utf8",
);

const menuLimitsTable = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
  ),
  "utf8",
);

const menuLimitsActions = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
  ),
  "utf8",
);

const historicalSingleWarehouseRetirement = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260710220000_single_warehouse_retire_branch_kitchen.sql",
  ),
  "utf8",
);

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, `missing pg_dump object: ${createPrefix}`);
  const end = source.indexOf("\n\n--\n-- Name:", start + createPrefix.length);
  assert.notEqual(end, -1, `unterminated pg_dump object: ${createPrefix}`);
  return source.slice(start, end);
}

const branchMenuAvailabilityRpc = readPgDumpObject(
  prodBaseline,
  "CREATE FUNCTION public.branch_menu_limit_availability(",
);
const posMenuLimitsRpc = readPgDumpObject(
  prodBaseline,
  "CREATE FUNCTION public.get_branch_menu_daily_limits_for_pos(",
);
const enforceBranchStockAvailabilityRpc = readPgDumpObject(
  prodBaseline,
  "CREATE FUNCTION public.enforce_branch_stock_availability(",
);
const postSaleConsumptionRpc = readPgDumpObject(
  prodBaseline,
  "CREATE FUNCTION public.post_pos_sale_consumption_if_ready(",
);

test("remaining is unbounded when available_to_sell is null", () => {
  assert.equal(remainingDailyQuotaAfterDemand(limit({}), 3), null);
});

test("remaining follows server available_to_sell verbatim minus draft demand", () => {
  assert.equal(
    remainingDailyQuotaAfterDemand(limit({ available_to_sell: 10 }), 3),
    7,
  );
  assert.equal(
    remainingDailyQuotaAfterDemand(
      limit({ available_to_sell: 5, sold_today: 999 }),
      0,
    ),
    5,
  );
});

test("remaining never goes negative", () => {
  assert.equal(
    remainingDailyQuotaAfterDemand(limit({ available_to_sell: 2 }), 5),
    0,
  );
});

test("proposal blocking uses server availability", () => {
  const block = findDailyLimitBlockForProposal({
    activeDraftLines: [],
    proposed: {
      menuItemId: 1,
      itemName: "Sườn",
      quantity: 3,
      sides: [],
    },
    getLimit: (itemId) =>
      itemId === 1 ? limit({ available_to_sell: 2 }) : null,
  });

  assert.deepEqual(block, {
    reason: "exceeded",
    itemName: "Sườn",
    available: 2,
    requested: 3,
    stockLeg: true,
  });
});

test("proposal block marks stockLeg=false when a manual limit is set", () => {
  const block = findDailyLimitBlockForProposal({
    activeDraftLines: [],
    proposed: {
      menuItemId: 1,
      itemName: "Sườn",
      quantity: 3,
      sides: [],
    },
    getLimit: (itemId) =>
      itemId === 1
        ? limit({ manual_limit_quantity: 20, available_to_sell: 2 })
        : null,
  });

  assert.deepEqual(block, {
    reason: "exceeded",
    itemName: "Sườn",
    available: 2,
    requested: 3,
    stockLeg: false,
  });
});

test("blocked when available_to_sell is exhausted", () => {
  assert.equal(
    isDailyLimitBlockedAfterDemand(limit({ available_to_sell: 0 }), 1),
    true,
  );
  assert.equal(
    isDailyLimitBlockedAfterDemand(limit({ available_to_sell: 5 }), 1),
    false,
  );
});

test("disabled is always blocked; unlimited is never blocked", () => {
  assert.equal(
    isDailyLimitBlockedAfterDemand(limit({ is_disabled: true }), 0),
    true,
  );
  assert.equal(isDailyLimitBlockedAfterDemand(limit({}), 99), false);
});

test("limit_ratchet: shrinking live capacity must not double-count sold_today", () => {
  // Capacity starts at 100, no manual limit. After 51 sold, capacity
  // recomputes to 49; server reports available_to_sell = 49 directly (already
  // net of demand). The client must ALLOW further adds — the old fallback
  // (min(limit, capacity) - sold_today) double-counted sold_today against a
  // live-shrinking capacity and would have blocked here (100 vs 49 vs -2).
  const row = limit({
    manual_limit_quantity: null,
    sold_today: 51,
    available_to_sell: 49,
  });

  assert.equal(remainingDailyQuotaAfterDemand(row, 0), 49);
  assert.equal(isDailyLimitBlockedAfterDemand(row, 0), false);

  const block = findDailyLimitBlockForProposal({
    activeDraftLines: [],
    proposed: {
      menuItemId: 1,
      itemName: "Cơm sườn",
      quantity: 10,
      sides: [],
    },
    getLimit: (itemId) => (itemId === 1 ? row : null),
  });
  assert.equal(block, null);
});

test("stock-outcome availability uses the live gate without double-counting sold demand", () => {
  assert.match(posMenuLimitsRpc, /pos_stock_outcome_posting/);
  assert.match(posMenuLimitsRpc, /AS gate_eff/);
  assert.match(posMenuLimitsRpc, /public\.branch_menu_limit_availability\(/);
  assert.match(branchMenuAvailabilityRpc, /pending_item AS \(/);
  assert.match(branchMenuAvailabilityRpc, /holds_item AS \(/);
  assert.match(
    branchMenuAvailabilityRpc,
    /WHEN NOT p_stock_gate_enabled THEN NULL::integer/,
  );
  assert.match(
    branchMenuAvailabilityRpc,
    /r\.manual_limit_quantity - r\.sold_today - r\.item_active_hold_demand/,
  );
});

test("stock availability reserves shared recipe ingredients across menu items", () => {
  assert.match(branchMenuAvailabilityRpc, /pending_ingredient AS \(/);
  assert.match(branchMenuAvailabilityRpc, /holds_ingredient AS \(/);
  assert.match(
    branchMenuAvailabilityRpc,
    /JOIN recipe_lines rl ON rl\.menu_item_id = pi\.menu_item_id/,
  );
  assert.match(
    branchMenuAvailabilityRpc,
    /JOIN recipe_lines rl ON rl\.menu_item_id = hi\.menu_item_id/,
  );
  assert.match(
    branchMenuAvailabilityRpc,
    /LEFT JOIN pending_ingredient pi ON pi\.ingredient_id = rl\.ingredient_id/,
  );
  assert.match(
    branchMenuAvailabilityRpc,
    /LEFT JOIN holds_ingredient hi ON hi\.ingredient_id = rl\.ingredient_id/,
  );
  assert.match(
    branchMenuAvailabilityRpc,
    /ELSE r\.manual_limit_quantity - r\.sold_today - r\.item_active_hold_demand/,
  );
  assert.doesNotMatch(
    branchMenuAvailabilityRpc,
    /ELSE r\.manual_limit_quantity - r\.sold_today - r\.active_hold_demand/,
  );
});

test("menu-limit screen refreshes when availability inputs change", () => {
  assert.match(menuLimitsTable, /useRealtimeRefresh/);
  assert.match(menuLimitsTable, /branch_menu_item_daily_limits/);
  assert.match(menuLimitsTable, /branch_menu_item_daily_holds/);
  assert.match(menuLimitsTable, /table: "orders"/);
  assert.match(menuLimitsTable, /table: "stock_levels"/);
});

test("menu-limit operations keep scan facts compact and defer replenishment", () => {
  assert.match(menuLimitsTable, /availableToSellLabel/);
  assert.match(menuLimitsTable, /availabilityRuleHint/);
  assert.match(menuLimitsTable, /drawerMode/);
  assert.doesNotMatch(menuLimitsTable, /DescriptionList|AppToolbar|AppSection/);
  assert.doesNotMatch(menuLimitsTable, /manualLimitShortLabel/);
  assert.doesNotMatch(menuLimitsTable, /stockCapacityLabel/);
  assert.doesNotMatch(menuLimitsTable, /soldTodayLabel/);
  assert.doesNotMatch(menuLimitsTable, /pendingDemandLabel/);
  assert.doesNotMatch(menuLimitsTable, /activeHoldDemandLabel/);
  assert.doesNotMatch(menuLimitsTable, /pendingDemandCount/);
  assert.doesNotMatch(menuLimitsTable, /activeHoldDemandCount/);
  assert.doesNotMatch(menuLimitsTable, /getSoldProgress/);
  assert.doesNotMatch(menuLimitsActions, /default to stock capacity/);
  assert.doesNotMatch(menuLimitsActions, /Tồn Bếp chi nhánh/);
  assert.match(
    historicalSingleWarehouseRetirement,
    /'public\.enforce_branch_stock_availability\(\)'/,
  );
  assert.match(enforceBranchStockAvailabilityRpc, /pos_stock_outcome_posting/);
  assert.match(
    enforceBranchStockAvailabilityRpc,
    /location_kind = 'warehouse'/,
  );
  assert.doesNotMatch(
    enforceBranchStockAvailabilityRpc,
    /location_kind = 'kitchen'/,
  );
  assert.match(postSaleConsumptionRpc, /location_kind = 'warehouse'/);
  assert.doesNotMatch(postSaleConsumptionRpc, /location_kind = 'kitchen'/);
});
