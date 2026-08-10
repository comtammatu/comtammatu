import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPickupQueue,
  formatPickupOrderLabel,
  type BuildPickupQueueInput,
  type PickupQueueItem,
} from "../queue";

const base: BuildPickupQueueInput = {
  tickets: [
    {
      id: 1,
      order_id: 10,
      kitchen_send_batch_id: 900,
      status: "ready",
      bumped_at: "2026-05-24T03:10:00.000Z",
      created_at: "2026-05-24T03:00:00.000Z",
      updated_at: "2026-05-24T03:10:00.000Z",
    },
    {
      id: 2,
      order_id: 10,
      kitchen_send_batch_id: 900,
      status: "ready",
      bumped_at: "2026-05-24T03:12:00.000Z",
      created_at: "2026-05-24T03:01:00.000Z",
      updated_at: "2026-05-24T03:12:00.000Z",
    },
    {
      id: 3,
      order_id: 11,
      kitchen_send_batch_id: null,
      status: "preparing",
      bumped_at: null,
      created_at: "2026-05-24T03:02:00.000Z",
      updated_at: "2026-05-24T03:02:00.000Z",
    },
    {
      id: 4,
      order_id: 12,
      kitchen_send_batch_id: null,
      status: "cancelled",
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
      status: "completed",
      created_at: "2026-05-24T03:03:00.000Z",
      tables: null,
    },
  ],
  kitchenBatches: [
    {
      id: 900,
      order_id: 10,
      kitchen_ticket_number: "#007",
      send_seq: 1,
      kind: "initial",
      created_at: "2026-05-24T03:00:00.000Z",
    },
  ],
};

function makePickupItem(overrides: Partial<PickupQueueItem>): PickupQueueItem {
  return {
    id: "item-1",
    lane: "active",
    status: "pending",
    isPriority: false,
    ticketIds: [1],
    readyTicketIds: [],
    orderId: 10,
    orderNumber: "MV-260525-055-PH",
    orderReceivedAt: "2026-05-25T03:00:00.000Z",
    callNumber: "MV-260525-055-PH",
    callPrefix: "Số",
    referenceNumber: "MV-260525-055-PH",
    referenceNumbers: ["MV-260525-055-PH"],
    orderType: "takeaway",
    targetKey: "order-10",
    tableNumber: null,
    ticketCount: 1,
    sortAt: "2026-05-25T03:00:00.000Z",
    ...overrides,
  };
}

test("formatPickupOrderLabel shortens date-based takeaway order numbers", () => {
  const item = makePickupItem({
    orderNumber: "MV-260525-055-PH",
  });

  assert.equal(formatPickupOrderLabel(item), "Mang về #055");
  assert.equal(item.orderNumber, "MV-260525-055-PH");
});

test("formatPickupOrderLabel preserves leading zeroes with branch suffixes", () => {
  assert.equal(
    formatPickupOrderLabel(
      makePickupItem({ orderNumber: "MV-20260524-007-CN1" }),
    ),
    "Mang về #007",
  );
  assert.equal(
    formatPickupOrderLabel(makePickupItem({ orderNumber: "MV-20260524-014" })),
    "Mang về #014",
  );
});

test("formatPickupOrderLabel falls back for old-format or malformed takeaway codes", () => {
  assert.equal(
    formatPickupOrderLabel(makePickupItem({ orderNumber: "MV-0007" })),
    "Mang về MV-0007",
  );
  assert.equal(
    formatPickupOrderLabel(makePickupItem({ orderNumber: "MV-ABC-PH" })),
    "Mang về MV-ABC-PH",
  );
});

test("formatPickupOrderLabel keeps dine-in table labels unchanged", () => {
  assert.equal(
    formatPickupOrderLabel(
      makePickupItem({
        orderNumber: "TC-260525-055-PH",
        orderType: "dine_in",
        tableNumber: 5,
      }),
    ),
    "Bàn 5",
  );
});

test("buildPickupQueue groups completed takeaway tickets by kitchen batch and uses stable fallback number", () => {
  const queue = buildPickupQueue(base);

  assert.equal(queue.length, 2);
  const ready = queue.find(
    (item) => item.orderNumber === "MV-20260524-007-CN1",
  );

  assert.equal(ready?.lane, "ready");
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.callNumber, "#007");
  assert.equal(ready?.callPrefix, "Số");
  assert.equal(ready?.referenceNumber, "#007");
  assert.equal(ready?.orderReceivedAt, "2026-05-24T03:00:00.000Z");
  assert.equal(ready?.ticketCount, 2);
  assert.deepEqual(ready?.ticketIds, [1, 2]);
  assert.deepEqual(ready?.readyTicketIds, [1, 2]);
});

test("buildPickupQueue preserves order-based append kitchen ticket suffixes", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 15,
        order_id: 23,
        kitchen_send_batch_id: 901,
        status: "ready",
        bumped_at: "2026-05-24T03:30:00.000Z",
        created_at: "2026-05-24T03:29:00.000Z",
        updated_at: "2026-05-24T03:30:00.000Z",
      },
    ],
    orders: [
      {
        id: 23,
        order_number: "MV-20260524-105-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "ready",
        created_at: "2026-05-24T03:29:00.000Z",
        tables: null,
      },
    ],
    kitchenBatches: [
      {
        id: 901,
        order_id: 23,
        kitchen_ticket_number: "#105-2",
        send_seq: 2,
        kind: "append",
        created_at: "2026-05-24T03:29:00.000Z",
      },
    ],
  };

  const [item] = buildPickupQueue(input);

  assert.equal(item?.callNumber, "#105-2");
  assert.equal(item?.referenceNumber, "#105-2");
});

test("buildPickupQueue keeps preparing orders and skips cancelled KDS tickets", () => {
  const queue = buildPickupQueue(base);
  const preparing = queue.find(
    (item) => item.orderNumber === "TC-20260524-008-CN1",
  );

  assert.equal(preparing?.lane, "active");
  assert.equal(preparing?.status, "preparing");
  assert.equal(preparing?.callNumber, "5");
  assert.equal(preparing?.callPrefix, "Bàn");
  assert.equal(preparing?.referenceNumber, "TC-20260524-008-CN1");
  assert.equal(
    queue.some((item) => item.orderNumber === "MV-20260524-009-CN1"),
    false,
  );
});

test("buildPickupQueue keeps POS-completed orders while KDS tickets are live", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 23,
        order_id: 23,
        kitchen_send_batch_id: null,
        status: "preparing",
        bumped_at: null,
        created_at: "2026-05-24T03:30:00.000Z",
        updated_at: "2026-05-24T03:30:00.000Z",
      },
    ],
    orders: [
      {
        id: 23,
        order_number: "TC-20260524-023-CN1",
        order_type: "dine_in",
        table_id: 7,
        status: "completed",
        created_at: "2026-05-24T03:29:00.000Z",
        tables: { number: 7 },
      },
    ],
    kitchenBatches: [],
  };

  const [item] = buildPickupQueue(input);

  assert.equal(item?.orderNumber, "TC-20260524-023-CN1");
  assert.equal(item?.lane, "active");
  assert.equal(item?.status, "preparing");
  assert.equal(item?.callPrefix, "Bàn");
  assert.equal(item?.callNumber, "7");
});

test("buildPickupQueue ranks active priority before normal active work and ready hand-offs", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 30,
        order_id: 30,
        order_item_id: 300,
        kitchen_send_batch_id: null,
        status: "ready",
        bumped_at: "2026-05-24T03:03:00.000Z",
        created_at: "2026-05-24T03:00:00.000Z",
        updated_at: "2026-05-24T03:03:00.000Z",
      },
      {
        id: 31,
        order_id: 31,
        order_item_id: 310,
        kitchen_send_batch_id: null,
        status: "pending",
        bumped_at: null,
        created_at: "2026-05-24T03:01:00.000Z",
        updated_at: "2026-05-24T03:01:00.000Z",
      },
      {
        id: 32,
        order_id: 32,
        order_item_id: 320,
        kitchen_send_batch_id: null,
        status: "pending",
        bumped_at: null,
        created_at: "2026-05-24T03:02:00.000Z",
        updated_at: "2026-05-24T03:02:00.000Z",
      },
      {
        id: 33,
        order_id: 33,
        order_item_id: 330,
        kitchen_send_batch_id: null,
        status: "preparing",
        bumped_at: null,
        created_at: "2026-05-24T03:04:00.000Z",
        updated_at: "2026-05-24T03:04:00.000Z",
      },
    ],
    orders: [
      {
        id: 30,
        order_number: "MV-20260524-030-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "ready",
        created_at: "2026-05-24T03:00:00.000Z",
        tables: null,
      },
      {
        id: 31,
        order_number: "MV-20260524-031-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "preparing",
        created_at: "2026-05-24T03:01:00.000Z",
        tables: null,
      },
      {
        id: 32,
        order_number: "MV-20260524-032-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "preparing",
        created_at: "2026-05-24T03:02:00.000Z",
        tables: null,
      },
      {
        id: 33,
        order_number: "MV-20260524-033-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "preparing",
        created_at: "2026-05-24T03:04:00.000Z",
        tables: null,
      },
    ],
    orderItems: [{ id: 320, order_id: 32, is_priority: true }],
    kitchenBatches: [],
  };

  const queue = buildPickupQueue(input);

  assert.deepEqual(
    queue.map((item) => item.orderNumber),
    [
      "MV-20260524-032-CN1",
      "MV-20260524-031-CN1",
      "MV-20260524-033-CN1",
      "MV-20260524-030-CN1",
    ],
  );
  assert.equal(queue[0]?.isPriority, true);
  assert.equal(queue[0]?.status, "pending");
  assert.equal(queue[3]?.lane, "ready");
});

test("buildPickupQueue keeps a fully-bumped order on the ready lane without blocking cooking orders", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 40,
        order_id: 40,
        kitchen_send_batch_id: null,
        status: "ready",
        bumped_at: "2026-05-24T03:05:00.000Z",
        created_at: "2026-05-24T03:00:00.000Z",
        updated_at: "2026-05-24T03:05:00.000Z",
      },
      {
        id: 41,
        order_id: 41,
        kitchen_send_batch_id: null,
        status: "preparing",
        bumped_at: null,
        created_at: "2026-05-24T02:50:00.000Z",
        updated_at: "2026-05-24T02:50:00.000Z",
      },
    ],
    orders: [
      {
        id: 40,
        order_number: "MV-20260524-040-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "completed",
        created_at: "2026-05-24T03:00:00.000Z",
        tables: null,
      },
      {
        id: 41,
        order_number: "MV-20260524-041-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "preparing",
        created_at: "2026-05-24T02:50:00.000Z",
        tables: null,
      },
    ],
    kitchenBatches: [],
  };

  const queue = buildPickupQueue(input);

  assert.equal(queue[0]?.orderNumber, "MV-20260524-041-CN1");
  assert.equal(queue[0]?.lane, "active");
  assert.equal(queue[1]?.orderNumber, "MV-20260524-040-CN1");
  assert.equal(queue[1]?.lane, "ready");
  assert.equal(queue[1]?.status, "ready");
});

test("buildPickupQueue keeps mixed KDS batch statuses in one active row", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 34,
        order_id: 34,
        order_item_id: 340,
        kitchen_send_batch_id: 934,
        status: "pending",
        bumped_at: null,
        created_at: "2026-05-24T03:05:00.000Z",
        updated_at: "2026-05-24T03:05:00.000Z",
      },
      {
        id: 35,
        order_id: 34,
        order_item_id: 350,
        kitchen_send_batch_id: 934,
        status: "ready",
        bumped_at: "2026-05-24T03:06:00.000Z",
        created_at: "2026-05-24T03:05:30.000Z",
        updated_at: "2026-05-24T03:06:00.000Z",
      },
    ],
    orders: [
      {
        id: 34,
        order_number: "MV-20260524-034-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "preparing",
        created_at: "2026-05-24T03:05:00.000Z",
        tables: null,
      },
    ],
    kitchenBatches: [
      {
        id: 934,
        order_id: 34,
        kitchen_ticket_number: "#034",
        send_seq: 1,
        kind: "initial",
        created_at: "2026-05-24T03:05:00.000Z",
      },
    ],
  };

  const queue = buildPickupQueue(input);

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.lane, "active");
  assert.equal(queue[0]?.status, "pending");
  assert.equal(queue[0]?.ticketCount, 2);
  assert.deepEqual(queue[0]?.readyTicketIds, [35]);
});

test("buildPickupQueue falls back to order number and preserves leading zeroes", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 5,
        order_id: 13,
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
    kitchenBatches: [],
  };

  assert.equal(buildPickupQueue(input)[0]?.callNumber, "MV-0007");
});

test("buildPickupQueue uses table number as the dominant dine-in display", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 6,
        order_id: 14,
        kitchen_send_batch_id: null,
        status: "ready",
        bumped_at: "2026-05-24T03:20:00.000Z",
        created_at: "2026-05-24T03:19:00.000Z",
        updated_at: "2026-05-24T03:20:00.000Z",
      },
    ],
    orders: [
      {
        id: 14,
        order_number: "TC-20260524-010-CN1",
        order_type: "dine_in",
        table_id: 9,
        status: "ready",
        created_at: "2026-05-24T03:19:00.000Z",
        tables: { number: 12 },
      },
    ],
    kitchenBatches: [],
  };

  const [item] = buildPickupQueue(input);

  assert.equal(item?.callPrefix, "Bàn");
  assert.equal(item?.callNumber, "12");
  assert.equal(item?.referenceNumber, "TC-20260524-010-CN1");
});

test("buildPickupQueue lets active work win over completed history for the same target", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 7,
        order_id: 15,
        kitchen_send_batch_id: null,
        status: "ready",
        bumped_at: "2026-05-24T03:20:00.000Z",
        created_at: "2026-05-24T03:19:00.000Z",
        updated_at: "2026-05-24T03:20:00.000Z",
      },
      {
        id: 8,
        order_id: 16,
        kitchen_send_batch_id: null,
        status: "preparing",
        bumped_at: null,
        created_at: "2026-05-24T03:21:00.000Z",
        updated_at: "2026-05-24T03:21:00.000Z",
      },
    ],
    orders: [
      {
        id: 15,
        order_number: "TC-20260524-011-CN1",
        order_type: "dine_in",
        table_id: 9,
        status: "ready",
        created_at: "2026-05-24T03:19:00.000Z",
        tables: { number: 12 },
      },
      {
        id: 16,
        order_number: "TC-20260524-012-CN1",
        order_type: "dine_in",
        table_id: 9,
        status: "preparing",
        created_at: "2026-05-24T03:21:00.000Z",
        tables: { number: 12 },
      },
    ],
    kitchenBatches: [],
  };

  const queue = buildPickupQueue(input);

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.lane, "active");
  assert.equal(queue[0]?.status, "preparing");
  assert.equal(queue[0]?.callNumber, "12");
});

test("buildPickupQueue keeps recently served targets in the served lane", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 9,
        order_id: 17,
        kitchen_send_batch_id: null,
        status: "served",
        bumped_at: "2026-05-24T03:24:00.000Z",
        created_at: "2026-05-24T03:22:00.000Z",
        updated_at: "2026-05-24T03:24:00.000Z",
      },
      {
        id: 10,
        order_id: 18,
        kitchen_send_batch_id: null,
        status: "served",
        bumped_at: "2026-05-24T03:26:00.000Z",
        created_at: "2026-05-24T03:23:00.000Z",
        updated_at: "2026-05-24T03:26:00.000Z",
      },
    ],
    orders: [
      {
        id: 17,
        order_number: "TC-20260524-013-CN1",
        order_type: "dine_in",
        table_id: 9,
        status: "served",
        created_at: "2026-05-24T03:22:00.000Z",
        tables: { number: 12 },
      },
      {
        id: 18,
        order_number: "MV-20260524-014-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "served",
        created_at: "2026-05-24T03:23:00.000Z",
        tables: null,
      },
    ],
    kitchenBatches: [],
  };

  const queue = buildPickupQueue(input);

  assert.equal(queue.length, 2);
  assert.equal(queue[0]?.lane, "served");
  assert.equal(queue[0]?.orderNumber, "MV-20260524-014-CN1");
  assert.deepEqual(queue[0]?.readyTicketIds, []);
  assert.equal(queue[1]?.callPrefix, "Bàn");
  assert.equal(queue[1]?.callNumber, "12");
});

test("buildPickupQueue ages old served targets out of the served lane", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    servedAfterIso: "2026-05-24T03:25:00.000Z",
    tickets: [
      {
        id: 11,
        order_id: 19,
        kitchen_send_batch_id: null,
        status: "served",
        bumped_at: "2026-05-24T03:10:00.000Z",
        created_at: "2026-05-24T03:00:00.000Z",
        updated_at: "2026-05-24T03:10:00.000Z",
      },
      {
        id: 12,
        order_id: 20,
        kitchen_send_batch_id: null,
        status: "served",
        bumped_at: "2026-05-24T03:26:00.000Z",
        created_at: "2026-05-24T03:20:00.000Z",
        updated_at: "2026-05-24T03:26:00.000Z",
      },
    ],
    orders: [
      {
        id: 19,
        order_number: "MV-20260524-015-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "served",
        created_at: "2026-05-24T03:00:00.000Z",
        tables: null,
      },
      {
        id: 20,
        order_number: "MV-20260524-016-CN1",
        order_type: "takeaway",
        table_id: null,
        status: "served",
        created_at: "2026-05-24T03:20:00.000Z",
        tables: null,
      },
    ],
    kitchenBatches: [],
  };

  const queue = buildPickupQueue(input);

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.orderNumber, "MV-20260524-016-CN1");
});

test("buildPickupQueue lets active work win over recent served history for the same target", () => {
  const input: BuildPickupQueueInput = {
    ...base,
    tickets: [
      {
        id: 13,
        order_id: 21,
        kitchen_send_batch_id: null,
        status: "served",
        bumped_at: "2026-05-24T03:26:00.000Z",
        created_at: "2026-05-24T03:20:00.000Z",
        updated_at: "2026-05-24T03:26:00.000Z",
      },
      {
        id: 14,
        order_id: 22,
        kitchen_send_batch_id: null,
        status: "preparing",
        bumped_at: null,
        created_at: "2026-05-24T03:27:00.000Z",
        updated_at: "2026-05-24T03:27:00.000Z",
      },
    ],
    orders: [
      {
        id: 21,
        order_number: "TC-20260524-017-CN1",
        order_type: "dine_in",
        table_id: 9,
        status: "served",
        created_at: "2026-05-24T03:20:00.000Z",
        tables: { number: 12 },
      },
      {
        id: 22,
        order_number: "TC-20260524-018-CN1",
        order_type: "dine_in",
        table_id: 9,
        status: "preparing",
        created_at: "2026-05-24T03:27:00.000Z",
        tables: { number: 12 },
      },
    ],
    kitchenBatches: [],
  };

  const queue = buildPickupQueue(input);

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.lane, "active");
  assert.equal(queue[0]?.status, "preparing");
  assert.equal(queue[0]?.orderNumber, "TC-20260524-018-CN1");
});
