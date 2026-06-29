import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKdsCompletionHistory,
  type KdsCompletionHistoryBatch,
  type KdsCompletionHistoryOrderInfo,
  type KdsCompletionHistoryOrderItem,
  type KdsCompletionHistoryTicket,
} from "../app/(protected)/br/[branchId]/kds/_lib/completion-history";

const orders: KdsCompletionHistoryOrderInfo[] = [
  {
    id: 10,
    order_number: "A001",
    order_type: "dine_in",
    table_id: 7,
    created_at: "2026-05-28T03:00:00.000Z",
    tables: { number: 12 },
  },
  {
    id: 11,
    order_number: "A002",
    order_type: "takeaway",
    table_id: null,
    created_at: "2026-05-28T03:05:00.000Z",
    tables: null,
  },
];

const items: KdsCompletionHistoryOrderItem[] = [
  {
    id: 101,
    order_id: 10,
    item_name: "Cơm sườn",
    quantity: 2,
    status: "ready",
  },
  {
    id: 102,
    order_id: 10,
    item_name: "Canh rong biển",
    quantity: 1,
    status: "ready",
  },
  {
    id: 201,
    order_id: 11,
    item_name: "Bì chả",
    quantity: 3,
    status: "ready",
  },
];

const batches: KdsCompletionHistoryBatch[] = [
  {
    id: 501,
    order_id: 10,
    kitchen_ticket_number: "BEP-001",
    send_seq: 1,
    kind: "initial",
    created_at: "2026-05-28T03:01:00.000Z",
  },
];

test("KDS completion history groups completed tickets by kitchen batch", () => {
  const tickets: KdsCompletionHistoryTicket[] = [
    {
      id: 1,
      order_id: 10,
      order_item_id: 101,
      kitchen_send_batch_id: 501,
      status: "ready",
      bumped_at: "2026-05-28T03:10:00.000Z",
      created_at: "2026-05-28T03:01:00.000Z",
      updated_at: "2026-05-28T03:10:00.000Z",
    },
    {
      id: 2,
      order_id: 10,
      order_item_id: 102,
      kitchen_send_batch_id: 501,
      status: "ready",
      bumped_at: "2026-05-28T03:12:00.000Z",
      created_at: "2026-05-28T03:01:00.000Z",
      updated_at: "2026-05-28T03:12:00.000Z",
    },
  ];

  assert.deepEqual(
    buildKdsCompletionHistory({
      tickets,
      orders,
      items,
      batches,
      limit: 10,
    }),
    [
      {
        groupKey: "batch-501",
        orderId: 10,
        orderNumber: "A001",
        kitchenTicketNumber: "BEP-001",
        orderType: "dine_in",
        tableNumber: 12,
        completedAt: "2026-05-28T03:12:00.000Z",
        ticketCount: 2,
        itemCount: 2,
        itemQuantity: 3,
        items: [
          {
            id: 101,
            name: "Cơm sườn",
            quantity: 2,
            status: "ready",
          },
          {
            id: 102,
            name: "Canh rong biển",
            quantity: 1,
            status: "ready",
          },
        ],
      },
    ],
  );
});

test("KDS completion history falls back to order groups without batches", () => {
  const tickets: KdsCompletionHistoryTicket[] = [
    {
      id: 3,
      order_id: 11,
      order_item_id: 201,
      kitchen_send_batch_id: null,
      status: "served",
      bumped_at: "2026-05-28T03:20:00.000Z",
      created_at: "2026-05-28T03:06:00.000Z",
      updated_at: "2026-05-28T03:20:00.000Z",
    },
  ];

  const [entry] = buildKdsCompletionHistory({
    tickets,
    orders,
    items,
    batches,
    limit: 10,
  });

  assert.equal(entry?.groupKey, "order-11");
  assert.equal(entry?.kitchenTicketNumber, "A002");
  assert.equal(entry?.orderType, "takeaway");
  assert.equal(entry?.tableNumber, null);
  assert.equal(entry?.itemQuantity, 3);
});

test("KDS completion history sorts newest completion first and honors limit", () => {
  const tickets: KdsCompletionHistoryTicket[] = [
    {
      id: 1,
      order_id: 10,
      order_item_id: 101,
      kitchen_send_batch_id: 501,
      status: "ready",
      bumped_at: "2026-05-28T03:10:00.000Z",
      created_at: "2026-05-28T03:01:00.000Z",
      updated_at: "2026-05-28T03:10:00.000Z",
    },
    {
      id: 3,
      order_id: 11,
      order_item_id: 201,
      kitchen_send_batch_id: null,
      status: "served",
      bumped_at: "2026-05-28T03:20:00.000Z",
      created_at: "2026-05-28T03:06:00.000Z",
      updated_at: "2026-05-28T03:20:00.000Z",
    },
  ];

  const history = buildKdsCompletionHistory({
    tickets,
    orders,
    items,
    batches,
    limit: 1,
  });

  assert.deepEqual(
    history.map((entry) => entry.groupKey),
    ["order-11"],
  );
});
