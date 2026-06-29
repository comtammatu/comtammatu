import assert from "node:assert/strict";
import { test } from "node:test";
import {
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

test("remaining is unbounded when both caps are null", () => {
  assert.equal(remainingDailyQuotaAfterDemand(limit({}), 3), null);
});

test("manual limit_quantity still works when stock_capacity is absent", () => {
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
    remainingDailyQuotaAfterDemand(limit({ stock_capacity: 4, sold_today: 1 }), 0),
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
    remainingDailyQuotaAfterDemand(limit({ stock_capacity: 2, sold_today: 5 }), 0),
    0,
  );
});

test("blocked when stock_capacity is exhausted, even with no manual limit", () => {
  assert.equal(
    isDailyLimitBlockedAfterDemand(limit({ stock_capacity: 2, sold_today: 2 }), 1),
    true,
  );
  assert.equal(
    isDailyLimitBlockedAfterDemand(limit({ stock_capacity: 5, sold_today: 1 }), 1),
    false,
  );
});

test("disabled is always blocked; both-null is never blocked", () => {
  assert.equal(isDailyLimitBlockedAfterDemand(limit({ is_disabled: true }), 0), true);
  assert.equal(isDailyLimitBlockedAfterDemand(limit({}), 99), false);
});
