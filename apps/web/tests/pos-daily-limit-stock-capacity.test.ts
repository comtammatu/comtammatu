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

const stockOutcomeAvailabilityMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260630071000_pos_kds_inventory_truth_g2_availability.sql",
  ),
  "utf8",
);

const ingredientPoolAvailabilityMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260709143000_pos_menu_availability_ingredient_pool.sql",
  ),
  "utf8",
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

test("stock-outcome availability SQL separates stock outcome and fallback counters", () => {
  assert.match(stockOutcomeAvailabilityMigration, /pos_stock_outcome_posting/);
  assert.match(
    stockOutcomeAvailabilityMigration,
    /COALESCE\(bl\.limit_quantity, bl\.stock_capacity\) AS limit_quantity/,
  );
  assert.match(stockOutcomeAvailabilityMigration, /pending_unfinalized_demand/);
  assert.match(stockOutcomeAvailabilityMigration, /active_hold_demand/);
  assert.match(
    stockOutcomeAvailabilityMigration,
    /WHEN p_stock_outcome_enabled THEN\s+r\.stock_capacity_live - r\.pending_unfinalized_demand - r\.active_hold_demand/,
  );
  assert.match(
    stockOutcomeAvailabilityMigration,
    /ELSE\s+r\.stock_capacity_live - r\.accepted_today - r\.active_hold_demand/,
  );
});

test("stock availability reserves shared recipe ingredients across menu items", () => {
  assert.match(
    ingredientPoolAvailabilityMigration,
    /pending_ingredient AS \(/,
  );
  assert.match(ingredientPoolAvailabilityMigration, /holds_ingredient AS \(/);
  assert.match(
    ingredientPoolAvailabilityMigration,
    /JOIN recipe_lines rl ON rl\.menu_item_id = pi\.menu_item_id/,
  );
  assert.match(
    ingredientPoolAvailabilityMigration,
    /JOIN recipe_lines rl ON rl\.menu_item_id = hi\.menu_item_id/,
  );
  assert.match(
    ingredientPoolAvailabilityMigration,
    /pi\.ingredient_id = rl\.ingredient_id/,
  );
  assert.match(
    ingredientPoolAvailabilityMigration,
    /hi\.ingredient_id = rl\.ingredient_id/,
  );
  assert.match(
    ingredientPoolAvailabilityMigration,
    /ELSE r\.manual_limit_quantity - r\.sold_today - r\.item_active_hold_demand/,
  );
  assert.doesNotMatch(
    ingredientPoolAvailabilityMigration,
    /ELSE r\.manual_limit_quantity - r\.sold_today - r\.active_hold_demand/,
  );
});
