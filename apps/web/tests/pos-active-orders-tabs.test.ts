import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
  type SessionOrder,
} from "../app/(protected)/br/[branchId]/pos/order-history";

const KITCHEN_WAITING_STATUSES = new Set(["new", "confirmed", "preparing"]);

function computeTabCounts(orders: SessionOrder[]) {
  const activeOrders = orders
    .filter(
      (order) =>
        ACTIVE_POS_STATUSES.includes(order.status) &&
        order.payment_status !== "paid",
    )
    .sort(compareOrdersByNextAction);

  let cooking = 0;
  let takeaway = 0;
  let dining = 0;
  for (const order of activeOrders) {
    if (KITCHEN_WAITING_STATUSES.has(order.status)) {
      cooking += 1;
    } else if (order.order_type === "dine_in") {
      dining += 1;
    }
    if (order.order_type === "takeaway") {
      takeaway += 1;
    }
  }

  return {
    all: activeOrders.length,
    cooking,
    takeaway,
    dining,
  };
}

function filterActiveOrders(
  orders: SessionOrder[],
  tab: "all" | "cooking" | "takeaway" | "dining",
) {
  const activeOrders = orders
    .filter(
      (order) =>
        ACTIVE_POS_STATUSES.includes(order.status) &&
        order.payment_status !== "paid",
    )
    .sort(compareOrdersByNextAction);

  switch (tab) {
    case "cooking":
      return activeOrders.filter((order) =>
        KITCHEN_WAITING_STATUSES.has(order.status),
      );
    case "takeaway":
      return activeOrders.filter((order) => order.order_type === "takeaway");
    case "dining":
      return activeOrders.filter(
        (order) =>
          order.order_type === "dine_in" &&
          !KITCHEN_WAITING_STATUSES.has(order.status),
      );
    case "all":
    default:
      return activeOrders;
  }
}

test("POS active orders quick filter tabs compute accurate counts and subsets", () => {
  const base = 1750000000000;
  const mockOrders: SessionOrder[] = [
    {
      id: 1,
      order_number: "POS-01",
      order_type: "dine_in",
      table_id: 1,
      status: "preparing",
      payment_status: null,
      created_at: new Date(base).toISOString(),
      total_amount: 100000,
    },
    {
      id: 2,
      order_number: "POS-02",
      order_type: "takeaway",
      table_id: null,
      status: "preparing",
      payment_status: null,
      created_at: new Date(base + 60000).toISOString(),
      total_amount: 55000,
    },
    {
      id: 3,
      order_number: "POS-03",
      order_type: "dine_in",
      table_id: 2,
      status: "served",
      payment_status: null,
      created_at: new Date(base + 120000).toISOString(),
      total_amount: 150000,
    },
    {
      id: 4,
      order_number: "POS-04",
      order_type: "takeaway",
      table_id: null,
      status: "ready",
      payment_status: null,
      created_at: new Date(base + 180000).toISOString(),
      total_amount: 70000,
    },
    {
      id: 5,
      order_number: "POS-05",
      order_type: "dine_in",
      table_id: 3,
      status: "served",
      payment_status: "paid", // archived/paid, excluded
      created_at: new Date(base + 240000).toISOString(),
      total_amount: 200000,
    },
  ];

  const counts = computeTabCounts(mockOrders);
  assert.equal(counts.all, 4);
  assert.equal(counts.cooking, 2); // 1 dine_in preparing + 1 takeaway preparing
  assert.equal(counts.takeaway, 2); // 2 takeaway orders (1 preparing, 1 ready)
  assert.equal(counts.dining, 1); // 1 dine_in served (unpaid)

  const cookingList = filterActiveOrders(mockOrders, "cooking");
  assert.equal(cookingList.length, 2);
  assert.deepEqual(
    cookingList.map((o) => o.id),
    [2, 1], // takeaway prioritized first when waiting
  );

  const takeawayList = filterActiveOrders(mockOrders, "takeaway");
  assert.equal(takeawayList.length, 2);
  assert.deepEqual(
    takeawayList.map((o) => o.id),
    [2, 4],
  );

  const diningList = filterActiveOrders(mockOrders, "dining");
  assert.equal(diningList.length, 1);
  assert.equal(diningList[0]?.id, 3);
});
