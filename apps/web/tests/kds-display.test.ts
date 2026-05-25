import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KDS_ORDER_COLUMN_DEFINITIONS,
  groupKdsOrdersByColumn,
} from "../app/(protected)/br/[branchId]/kds/lib/order-columns";
import { formatKdsTicketSequenceDisplay } from "../app/(protected)/br/[branchId]/kds/lib/status-config";
import type { KdsOrder } from "../app/(protected)/br/[branchId]/kds/types";

function makeOrder(
  overrides: Partial<KdsOrder> & Pick<KdsOrder, "groupKey">,
): KdsOrder {
  return {
    groupKey: overrides.groupKey,
    orderId: overrides.orderId ?? 1,
    orderNumber: overrides.orderNumber ?? "TC-20260525-001-PH",
    kitchenTicketNumber: overrides.kitchenTicketNumber ?? "PB-260525-001",
    orderType: overrides.orderType ?? "dine_in",
    tableNumber: overrides.tableNumber ?? null,
    createdAt: overrides.createdAt ?? "2026-05-25T01:00:00.000Z",
    sendSeq: overrides.sendSeq ?? 1,
    sendKind: overrides.sendKind ?? null,
    isPriority: overrides.isPriority ?? false,
    tickets: overrides.tickets ?? [],
    items: overrides.items ?? [],
  };
}

test("KDS title display uses kitchen ticket sequence instead of long order number", () => {
  assert.equal(
    formatKdsTicketSequenceDisplay("PB-260525-055", "TC-20260525-025-PH"),
    "#55",
  );
  assert.equal(formatKdsTicketSequenceDisplay("PB-260525-057"), "#57");
  assert.equal(formatKdsTicketSequenceDisplay("PB-260525-056"), "#56");
});

test("KDS title display falls back to order sequence", () => {
  assert.equal(
    formatKdsTicketSequenceDisplay(
      "KITCHEN-WITHOUT-SEQUENCE",
      "TC-20260525-025-PH",
    ),
    "#25",
  );
});

test("KDS comprehensive board groups orders into service columns", () => {
  const dineIn = makeOrder({ groupKey: "dine-in", orderType: "dine_in" });
  const takeaway = makeOrder({
    groupKey: "takeaway",
    orderType: "takeaway",
  });
  const append = makeOrder({
    groupKey: "append",
    orderType: "dine_in",
    sendKind: "append",
  });

  const columns = groupKdsOrdersByColumn([dineIn, takeaway, append]);

  assert.deepEqual(
    KDS_ORDER_COLUMN_DEFINITIONS.map((column) => [
      column.id,
      column.title,
      column.widthClass,
    ]),
    [
      ["dine_in", "Tại chỗ", "lg:col-span-4"],
      ["takeaway", "Mang về", "lg:col-span-4"],
      ["append", "Gọi thêm", "md:col-span-2 lg:col-span-2"],
    ],
  );
  assert.deepEqual(
    columns.map((column) => [
      column.id,
      column.orders.map((order) => order.groupKey),
    ]),
    [
      ["dine_in", ["dine-in"]],
      ["takeaway", ["takeaway"]],
      ["append", ["append"]],
    ],
  );
});
