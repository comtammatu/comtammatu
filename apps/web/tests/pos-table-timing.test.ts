import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveOrderTimingInfo,
  deriveTableTimingMap,
} from "../app/(protected)/br/[branchId]/pos/_lib/table-timing";

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
  assert.equal(t1.kitchenLatencyTone, "warning"); // >= 12 and < 20

  const t2 = timingMap.get(2);
  assert.ok(t2);
  assert.equal(t2.diningMinutes, 6);
  assert.equal(t2.kitchenWaitMinutes, 6);
  assert.equal(t2.kitchenLatencyTone, "normal"); // < 12

  const t3 = timingMap.get(3);
  assert.ok(t3);
  assert.equal(t3.diningMinutes, 26);
  assert.equal(t3.kitchenWaitMinutes, 26);
  assert.equal(t3.kitchenLatencyTone, "urgent"); // >= 20

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
