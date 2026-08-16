import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveOrderTimingInfo,
  deriveTableTimingMap,
} from "../app/(protected)/br/[branchId]/pos/_lib/table-timing";
import { compareOrdersByNextAction } from "../app/(protected)/br/[branchId]/pos/order-history";

const ACTIVE_STATUSES = ["new", "confirmed", "preparing", "ready", "served"];

test("deriveTableTimingMap classifies table dining and wait latency correctly", () => {
  const baseTime = 1750000000000;
  const now = baseTime + 16 * 60 * 1000; // 16 mins later

  const orders = [
    {
      id: 101,
      table_id: 1,
      status: "preparing",
      payment_status: null,
      created_at: new Date(baseTime).toISOString(),
    },
    {
      id: 102,
      table_id: 2,
      status: "preparing",
      payment_status: null,
      created_at: new Date(baseTime + 10 * 60 * 1000).toISOString(), // 6 mins ago
    },
    {
      id: 103,
      table_id: 3,
      status: "preparing",
      payment_status: null,
      created_at: new Date(baseTime - 10 * 60 * 1000).toISOString(), // 26 mins ago
    },
    {
      id: 104,
      table_id: 4,
      status: "ready",
      payment_status: null,
      created_at: new Date(baseTime).toISOString(),
      updated_at: new Date(baseTime + 10 * 60 * 1000).toISOString(), // ready 6 mins ago
    },
  ];

  const timingMap = deriveTableTimingMap(orders, ACTIVE_STATUSES, now);

  const t1 = timingMap.get(1);
  assert.ok(t1);
  assert.equal(t1.diningMinutes, 16);
  assert.equal(t1.kitchenWaitMinutes, 16);
  assert.equal(t1.kitchenLatencyTone, "urgent"); // >= 12

  const t2 = timingMap.get(2);
  assert.ok(t2);
  assert.equal(t2.diningMinutes, 6);
  assert.equal(t2.kitchenWaitMinutes, 6);
  assert.equal(t2.kitchenLatencyTone, "normal"); // < 7

  const t3 = timingMap.get(3);
  assert.ok(t3);
  assert.equal(t3.diningMinutes, 26);
  assert.equal(t3.kitchenWaitMinutes, 26);
  assert.equal(t3.kitchenLatencyTone, "urgent"); // >= 12

  const t4 = timingMap.get(4);
  assert.ok(t4);
  assert.equal(t4.orderVisualState, "served");
  assert.equal(t4.isReadyOverdue, false);
  assert.equal(t4.kitchenWaitMinutes, null);
});

test("deriveOrderTimingInfo computes order timing metrics", () => {
  const baseTime = 1750000000000;
  const now = baseTime + 22 * 60 * 1000;

  const urgentOrder = {
    id: 201,
    table_id: 1,
    status: "preparing",
    payment_status: null,
    created_at: new Date(baseTime).toISOString(),
  };

  const timing = deriveOrderTimingInfo(urgentOrder, now);
  assert.equal(timing.orderId, 201);
  assert.equal(timing.elapsedMinutes, 22);
  assert.equal(timing.kitchenLatencyTone, "urgent");
});

test("compareOrdersByNextAction sorts kitchen-waiting orders first and oldest-first in both groups", () => {
  const base = 1750000000000;
  const list = [
    {
      id: 1,
      order_number: "POS-01",
      order_type: "dine_in",
      status: "served",
      payment_status: null,
      created_at: new Date(base).toISOString(), // seated 40m ago, dining
      total_amount: 100000,
    },
    {
      id: 2,
      order_number: "POS-02",
      order_type: "dine_in",
      status: "preparing",
      payment_status: null,
      created_at: new Date(base + 10 * 60 * 1000).toISOString(), // waiting 30m ago (cooking)
      total_amount: 120000,
    },
    {
      id: 3,
      order_number: "POS-03",
      order_type: "dine_in",
      status: "preparing",
      payment_status: null,
      created_at: new Date(base + 20 * 60 * 1000).toISOString(), // waiting 20m ago (cooking)
      total_amount: 90000,
    },
    {
      id: 4,
      order_number: "POS-04",
      order_type: "dine_in",
      status: "served",
      payment_status: null,
      created_at: new Date(base + 15 * 60 * 1000).toISOString(), // seated 25m ago, dining
      total_amount: 80000,
    },
    {
      id: 5,
      order_number: "POS-05",
      order_type: "dine_in",
      status: "preparing",
      is_priority: true,
      payment_status: null,
      created_at: new Date(base + 25 * 60 * 1000).toISOString(), // priority cooking
      total_amount: 70000,
    },
  ];

  const sorted = [...list].sort(compareOrdersByNextAction);

  // 1. Priority cooking order first
  assert.equal(sorted[0]?.id, 5);
  // 2. Cooking order waiting longer (30m ago) before cooking order waiting less (20m ago)
  assert.equal(sorted[1]?.id, 2);
  assert.equal(sorted[2]?.id, 3);
  // 3. Dining order seated longer (40m ago) before dining order seated less (25m ago)
  assert.equal(sorted[3]?.id, 1);
  assert.equal(sorted[4]?.id, 4);
});
