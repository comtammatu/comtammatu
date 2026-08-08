import assert from "node:assert/strict";
import { test } from "node:test";
import { branchNavBadgeCounts } from "../app/(protected)/br/[branchId]/(operator)/_lib/branch-nav-badges";

test("branchNavBadgeCounts splits HR vs stock and sums home", () => {
  assert.deepEqual(
    branchNavBadgeCounts({
      pendingCheckouts: 1,
      pendingLeaveRequests: 2,
      pendingCountSlips: 0,
      pendingWaste: null,
      inboundTransfers: 1,
      openStockRequests: 1,
    }),
    { home: 5, team: 3, stock: 2 },
  );
});

test("branchNavBadgeCounts treats null permission fields as zero", () => {
  assert.deepEqual(
    branchNavBadgeCounts({
      pendingCheckouts: null,
      pendingLeaveRequests: null,
      pendingCountSlips: null,
      pendingWaste: null,
      inboundTransfers: null,
      openStockRequests: null,
    }),
    { home: 0, team: 0, stock: 0 },
  );
});
