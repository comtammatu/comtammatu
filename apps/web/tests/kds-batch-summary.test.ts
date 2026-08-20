import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateKdsBatchSummary } from "../app/(protected)/br/[branchId]/kds/_lib/batch-summary";
import { isKdsComCategory } from "../app/(protected)/br/[branchId]/kds/_lib/order-columns";
import type {
  KdsOrder,
  KdsOrderItem,
  KdsTicket,
} from "../app/(protected)/br/[branchId]/kds/types";

function makeTicket(overrides: Partial<KdsTicket> = {}): KdsTicket {
  return {
    id: overrides.id ?? 1,
    station_id: overrides.station_id ?? 1,
    order_id: overrides.order_id ?? 1,
    order_item_id: overrides.order_item_id ?? 10,
    kitchen_send_batch_id: overrides.kitchen_send_batch_id ?? 1,
    status: overrides.status ?? "pending",
    bumped_at: overrides.bumped_at ?? null,
    created_at: overrides.created_at ?? "2026-05-25T01:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-25T01:00:00.000Z",
  };
}

function makeItem(overrides: Partial<KdsOrderItem> = {}): KdsOrderItem {
  return {
    id: overrides.id ?? 10,
    order_id: overrides.order_id ?? 1,
    menu_item_id: overrides.menu_item_id ?? 100,
    item_name: overrides.item_name ?? "Cơm sườn",
    category_name: overrides.category_name ?? "Cơm",
    category_type: overrides.category_type ?? "main_dish",
    variant_name: overrides.variant_name ?? null,
    quantity: overrides.quantity ?? 1,
    unit_price: overrides.unit_price ?? 35_000,
    status: overrides.status ?? "pending",
    is_priority: overrides.is_priority ?? false,
    note: overrides.note ?? null,
    modifiers: overrides.modifiers ?? null,
    sides: overrides.sides ?? null,
  };
}

function makeOrder(
  items: KdsOrderItem[],
  tickets: KdsTicket[] = items.map((item) =>
    makeTicket({ id: item.id, order_item_id: item.id }),
  ),
): KdsOrder {
  return {
    groupKey: "dine-in-1",
    orderId: 1,
    orderNumber: "TC-20260525-001-PH",
    kitchenTicketNumber: "PB-260525-001",
    orderType: "dine_in",
    deliveryPlatform: null,
    externalOrderRef: null,
    tableNumber: 5,
    createdAt: "2026-05-25T01:00:00.000Z",
    sendSeq: 1,
    sendKind: null,
    isPriority: false,
    orderNote: null,
    tickets,
    items,
  };
}

test("isKdsComCategory matches only the named Cơm category", () => {
  assert.equal(isKdsComCategory({ category_name: "Cơm" }), true);
  assert.equal(isKdsComCategory({ category_name: "  CƠM " }), true);
  assert.equal(isKdsComCategory({ category_name: "Cơm thêm" }), false);
  assert.equal(isKdsComCategory({ category_name: "Món chính" }), false);
  assert.equal(isKdsComCategory({ category_name: null }), false);
});

test("KDS batch summary lists Cơm category dishes before higher-qty others", () => {
  const rice = makeItem({
    id: 11,
    item_name: "Cơm sườn",
    category_name: "Cơm",
    quantity: 1,
  });
  const soup = makeItem({
    id: 12,
    item_name: "Canh khổ qua",
    category_name: "Canh",
    quantity: 8,
  });
  const extraRiceNamed = makeItem({
    id: 13,
    item_name: "Cơm thêm",
    category_name: "Cơm thêm",
    quantity: 5,
  });

  const summary = aggregateKdsBatchSummary([
    makeOrder([soup, extraRiceNamed, rice]),
  ]);

  assert.deepEqual(
    summary.map((row) => row.itemName),
    ["Cơm sườn", "Canh khổ qua", "Cơm thêm"],
  );
  assert.equal(summary[0]?.isComCategory, true);
  assert.equal(summary[1]?.isComCategory, false);
});

test("KDS batch summary sorts Cơm dishes by quantity then name", () => {
  const cha = makeItem({
    id: 21,
    item_name: "Cơm chả",
    category_name: "Cơm",
    quantity: 2,
  });
  const suon = makeItem({
    id: 22,
    item_name: "Cơm sườn",
    category_name: "Cơm",
    quantity: 4,
  });
  const bi = makeItem({
    id: 23,
    item_name: "Cơm bì",
    category_name: "Cơm",
    quantity: 4,
  });

  const summary = aggregateKdsBatchSummary([makeOrder([cha, suon, bi])]);

  assert.deepEqual(
    summary.map((row) => [row.itemName, row.totalQuantity]),
    [
      ["Cơm bì", 4],
      ["Cơm sườn", 4],
      ["Cơm chả", 2],
    ],
  );
});

test("KDS batch summary ignores ready tickets", () => {
  const rice = makeItem({
    id: 31,
    item_name: "Cơm sườn",
    category_name: "Cơm",
    quantity: 3,
  });
  const soup = makeItem({
    id: 32,
    item_name: "Canh",
    category_name: "Canh",
    quantity: 1,
  });

  const summary = aggregateKdsBatchSummary([
    makeOrder(
      [rice, soup],
      [
        makeTicket({ id: 31, order_item_id: 31, status: "ready" }),
        makeTicket({ id: 32, order_item_id: 32, status: "pending" }),
      ],
    ),
  ]);

  assert.deepEqual(
    summary.map((row) => row.itemName),
    ["Canh"],
  );
});
