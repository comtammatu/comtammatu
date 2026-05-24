import assert from "node:assert/strict";
import test from "node:test";

import { buildRunnerQueue, type BuildRunnerQueueInput } from "../queue";

const base: BuildRunnerQueueInput = {
  tickets: [
    {
      id: 1,
      order_id: 10,
      order_item_id: 100,
      kitchen_send_batch_id: 900,
      status: "ready",
      bumped_at: "2026-05-24T03:10:00.000Z",
      created_at: "2026-05-24T03:00:00.000Z",
      updated_at: "2026-05-24T03:10:00.000Z",
    },
    {
      id: 2,
      order_id: 10,
      order_item_id: 101,
      kitchen_send_batch_id: 900,
      status: "ready",
      bumped_at: "2026-05-24T03:12:00.000Z",
      created_at: "2026-05-24T03:01:00.000Z",
      updated_at: "2026-05-24T03:12:00.000Z",
    },
    {
      id: 3,
      order_id: 11,
      order_item_id: 102,
      kitchen_send_batch_id: null,
      status: "preparing",
      bumped_at: null,
      created_at: "2026-05-24T03:02:00.000Z",
      updated_at: "2026-05-24T03:02:00.000Z",
    },
    {
      id: 4,
      order_id: 12,
      order_item_id: 103,
      kitchen_send_batch_id: null,
      status: "served",
      bumped_at: null,
      created_at: "2026-05-24T03:03:00.000Z",
      updated_at: "2026-05-24T03:03:00.000Z",
    },
  ],
  orders: [
    {
      id: 10,
      order_number: "MV-20260524-007-CN1",
      order_type: "takeaway",
      table_id: null,
      status: "ready",
      created_at: "2026-05-24T03:00:00.000Z",
      tables: null,
    },
    {
      id: 11,
      order_number: "TC-20260524-008-CN1",
      order_type: "dine_in",
      table_id: 5,
      status: "preparing",
      created_at: "2026-05-24T03:02:00.000Z",
      tables: { number: 5 },
    },
    {
      id: 12,
      order_number: "MV-20260524-009-CN1",
      order_type: "takeaway",
      table_id: null,
      status: "served",
      created_at: "2026-05-24T03:03:00.000Z",
      tables: null,
    },
  ],
  orderItems: [
    { id: 100, order_id: 10, item_name: "Cơm sườn", quantity: 1, status: "ready" },
    { id: 101, order_id: 10, item_name: "Canh rong biển", quantity: 2, status: "ready" },
    { id: 102, order_id: 11, item_name: "Bì chả", quantity: 1, status: "preparing" },
    { id: 103, order_id: 12, item_name: "Cơm gà", quantity: 1, status: "served" },
  ],
  kitchenBatches: [
    {
      id: 900,
      order_id: 10,
      kitchen_ticket_number: "BEP-007",
      send_seq: 1,
      kind: "initial",
      created_at: "2026-05-24T03:00:00.000Z",
    },
  ],
};

test("buildRunnerQueue groups ready tickets by kitchen batch and uses stable call number", () => {
  const queue = buildRunnerQueue(base);

  assert.equal(queue.length, 2);
  assert.equal(queue[0]?.lane, "calling");
  assert.equal(queue[0]?.callNumber, "BEP-007");
  assert.equal(queue[0]?.ticketCount, 2);
  assert.deepEqual(queue[0]?.itemPreview, ["1x Cơm sườn", "2x Canh rong biển"]);
});

test("buildRunnerQueue keeps preparing orders secondary and hides served tickets/orders", () => {
  const queue = buildRunnerQueue(base);

  assert.equal(queue[1]?.lane, "preparing");
  assert.equal(queue[1]?.callNumber, "TC-20260524-008-CN1");
  assert.equal(queue.some((item) => item.orderNumber === "MV-20260524-009-CN1"), false);
});

test("buildRunnerQueue falls back to order number and preserves leading zeroes", () => {
  const input: BuildRunnerQueueInput = {
    ...base,
    tickets: [
      {
        id: 5,
        order_id: 13,
        order_item_id: 104,
        kitchen_send_batch_id: null,
        status: "ready",
        bumped_at: "2026-05-24T03:08:00.000Z",
        created_at: "2026-05-24T03:07:00.000Z",
        updated_at: "2026-05-24T03:08:00.000Z",
      },
    ],
    orders: [
      {
        id: 13,
        order_number: "MV-0007",
        order_type: "takeaway",
        table_id: null,
        status: "ready",
        created_at: "2026-05-24T03:07:00.000Z",
        tables: null,
      },
    ],
    orderItems: [
      { id: 104, order_id: 13, item_name: "Cơm bì", quantity: 1, status: "ready" },
    ],
    kitchenBatches: [],
  };

  assert.equal(buildRunnerQueue(input)[0]?.callNumber, "MV-0007");
});
