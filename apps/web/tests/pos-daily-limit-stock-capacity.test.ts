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
    limit_quantity: null,
    is_disabled: false,
    sold_today: 0,
    stock_capacity: null,
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

test("remaining is unbounded when both caps are null", () => {
  assert.equal(remainingDailyQuotaAfterDemand(limit({}), 3), null);
});

test("limit_quantity fallback still works when stock_capacity is absent", () => {
  assert.equal(
    remainingDailyQuotaAfterDemand(
      limit({ limit_quantity: 10, sold_today: 3 }),
      2,
    ),
    5,
  );
});

test("stock_capacity alone caps remaining", () => {
  assert.equal(
    remainingDailyQuotaAfterDemand(
      limit({ stock_capacity: 4, sold_today: 1 }),
      0,
    ),
    3,
  );
});

test("effective cap is the min of limit_quantity and stock_capacity", () => {
  // stock binds
  assert.equal(
    remainingDailyQuotaAfterDemand(
      limit({ limit_quantity: 10, stock_capacity: 4, sold_today: 2 }),
      0,
    ),
    2,
  );
  // manual binds
  assert.equal(
    remainingDailyQuotaAfterDemand(
      limit({ limit_quantity: 4, stock_capacity: 10, sold_today: 3 }),
      0,
    ),
    1,
  );
});

test("remaining never goes negative", () => {
  assert.equal(
    remainingDailyQuotaAfterDemand(
      limit({ stock_capacity: 2, sold_today: 5 }),
      0,
    ),
    0,
  );
});

test("server available_to_sell overrides stock-minus-sold fallback math", () => {
  const row = limit({
    stock_capacity: 10,
    sold_today: 8,
    pending_unfinalized_demand: 3,
    available_to_sell: 5,
  });

  assert.equal(remainingDailyQuotaAfterDemand(row, 0), 5);
  assert.equal(remainingDailyQuotaAfterDemand(row, 2), 3);
});

test("proposal blocking uses server availability when present", () => {
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
        ? limit({ stock_capacity: 10, sold_today: 8, available_to_sell: 2 })
        : null,
  });

  assert.deepEqual(block, {
    reason: "exceeded",
    itemName: "Sườn",
    available: 2,
    requested: 3,
  });
});

test("blocked when stock_capacity is exhausted, even with no manual limit", () => {
  assert.equal(
    isDailyLimitBlockedAfterDemand(
      limit({ stock_capacity: 2, sold_today: 2 }),
      1,
    ),
    true,
  );
  assert.equal(
    isDailyLimitBlockedAfterDemand(
      limit({ stock_capacity: 5, sold_today: 1 }),
      1,
    ),
    false,
  );
});

test("disabled is always blocked; both-null is never blocked", () => {
  assert.equal(
    isDailyLimitBlockedAfterDemand(limit({ is_disabled: true }), 0),
    true,
  );
  assert.equal(isDailyLimitBlockedAfterDemand(limit({}), 99), false);
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
