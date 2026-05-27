import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_SIGNAL_PATTERNS } from "../lib/audio-signal";
import {
  collectReadyKdsNewTicketAlertGroups,
  getKdsNewTicketAlertGroupKey,
  getKdsNewTicketSignalTone,
  getKdsNewTicketToastTitle,
  hasKdsNewTicketSignalMetadata,
  pickHigherPriorityKdsSignalTone,
} from "../app/(protected)/br/[branchId]/kds/lib/sound-alerts";
import type {
  KdsKitchenSendBatch,
  KdsOrderItem,
  KdsTicket,
} from "../app/(protected)/br/[branchId]/kds/types";

function makeTicket(overrides: Partial<KdsTicket> = {}): KdsTicket {
  return {
    id: overrides.id ?? 1,
    station_id: overrides.station_id ?? 1,
    order_id: overrides.order_id ?? 10,
    order_item_id: overrides.order_item_id ?? 100,
    kitchen_send_batch_id:
      "kitchen_send_batch_id" in overrides
        ? (overrides.kitchen_send_batch_id ?? null)
        : 1,
    status: overrides.status ?? "pending",
    bumped_at: overrides.bumped_at ?? null,
    created_at: overrides.created_at ?? "2026-05-25T01:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-25T01:00:00.000Z",
  };
}

function makeBatch(
  kind: string,
  overrides: Partial<KdsKitchenSendBatch> = {},
): KdsKitchenSendBatch {
  return {
    id: overrides.id ?? 1,
    order_id: overrides.order_id ?? 10,
    kitchen_ticket_number: overrides.kitchen_ticket_number ?? "PB-260525-001",
    send_seq: overrides.send_seq ?? (kind === "append" ? 2 : 1),
    kind: overrides.kind ?? kind,
    created_at: overrides.created_at ?? "2026-05-25T01:00:00.000Z",
  };
}

function makeItem(overrides: Partial<KdsOrderItem> = {}): KdsOrderItem {
  return {
    id: overrides.id ?? 100,
    order_id: overrides.order_id ?? 10,
    menu_item_id: overrides.menu_item_id ?? 1000,
    item_name: overrides.item_name ?? "Cơm sườn",
    category_name: overrides.category_name ?? "Món chính",
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

test("KDS new-ticket sound follows the visible toast taxonomy", () => {
  const initialBatches = new Map([[1, makeBatch("initial")]]);
  const appendBatches = new Map([[1, makeBatch("append")]]);

  const normalTone = getKdsNewTicketSignalTone({
    ticket: makeTicket(),
    item: makeItem(),
    kitchenBatches: initialBatches,
  });
  const appendTone = getKdsNewTicketSignalTone({
    ticket: makeTicket(),
    item: makeItem(),
    kitchenBatches: appendBatches,
  });
  const addOnTone = getKdsNewTicketSignalTone({
    ticket: makeTicket(),
    item: makeItem({ category_name: "Thêm", category_type: "side_dish" }),
    kitchenBatches: appendBatches,
  });

  assert.equal(normalTone, "kds-new");
  assert.equal(getKdsNewTicketToastTitle(normalTone), "Phiếu bếp mới");
  assert.equal(appendTone, "kds-append");
  assert.equal(getKdsNewTicketToastTitle(appendTone), "Phiếu gọi thêm mới");
  assert.equal(addOnTone, "kds-add-on");
  assert.equal(getKdsNewTicketToastTitle(addOnTone), "Món thêm mới");
});

test("KDS add-on sound wins over append when multiple ticket types arrive together", () => {
  assert.equal(
    pickHigherPriorityKdsSignalTone("kds-new", "kds-append"),
    "kds-append",
  );
  assert.equal(
    pickHigherPriorityKdsSignalTone("kds-append", "kds-add-on"),
    "kds-add-on",
  );
  assert.equal(
    pickHigherPriorityKdsSignalTone("kds-add-on", "kds-new"),
    "kds-add-on",
  );
});

test("KDS waits for item and batch metadata before choosing a sound", () => {
  const initialBatches = new Map([[1, makeBatch("initial")]]);

  assert.equal(
    hasKdsNewTicketSignalMetadata({
      ticket: makeTicket(),
      item: undefined,
      kitchenBatches: initialBatches,
    }),
    false,
  );
  assert.equal(
    hasKdsNewTicketSignalMetadata({
      ticket: makeTicket(),
      item: makeItem(),
      kitchenBatches: new Map(),
    }),
    false,
  );
  assert.equal(
    hasKdsNewTicketSignalMetadata({
      ticket: makeTicket({ kitchen_send_batch_id: null }),
      item: makeItem(),
      kitchenBatches: new Map(),
    }),
    true,
  );
  assert.equal(
    hasKdsNewTicketSignalMetadata({
      ticket: makeTicket(),
      item: makeItem(),
      kitchenBatches: initialBatches,
    }),
    true,
  );
});

test("KDS ticket categories use distinct audible patterns", () => {
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS["kds-new"],
    APP_SIGNAL_PATTERNS["kds-append"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS["kds-new"],
    APP_SIGNAL_PATTERNS["kds-add-on"],
  );
  assert.notDeepEqual(
    APP_SIGNAL_PATTERNS["kds-append"],
    APP_SIGNAL_PATTERNS["kds-add-on"],
  );
});

test("KDS groups multiple pending tickets from one kitchen batch into one alert", () => {
  const tickets = [
    makeTicket({ id: 101, order_item_id: 1001, kitchen_send_batch_id: 42 }),
    makeTicket({ id: 102, order_item_id: 1002, kitchen_send_batch_id: 42 }),
  ];
  const groups = collectReadyKdsNewTicketAlertGroups({
    tickets,
    pendingTicketIds: new Set([101, 102]),
    orderItemById: new Map([
      [1001, makeItem({ id: 1001 })],
      [1002, makeItem({ id: 1002 })],
    ]),
    kitchenBatches: new Map([[42, makeBatch("initial", { id: 42 })]]),
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.groupKey, "batch:42");
  assert.deepEqual(groups[0]?.ticketIds, [101, 102]);
  assert.equal(groups[0]?.tone, "kds-new");
});

test("KDS falls back to order grouping only for unbatched tickets", () => {
  assert.equal(
    getKdsNewTicketAlertGroupKey(
      makeTicket({ order_id: 20, kitchen_send_batch_id: null }),
    ),
    "order:20",
  );
  assert.equal(
    getKdsNewTicketAlertGroupKey(
      makeTicket({ order_id: 20, kitchen_send_batch_id: 43 }),
    ),
    "batch:43",
  );

  const tickets = [
    makeTicket({
      id: 201,
      order_id: 20,
      order_item_id: 2001,
      kitchen_send_batch_id: null,
    }),
    makeTicket({
      id: 202,
      order_id: 20,
      order_item_id: 2002,
      kitchen_send_batch_id: null,
    }),
    makeTicket({
      id: 203,
      order_id: 20,
      order_item_id: 2003,
      kitchen_send_batch_id: 43,
    }),
    makeTicket({
      id: 204,
      order_id: 20,
      order_item_id: 2004,
      kitchen_send_batch_id: 44,
    }),
  ];
  const groups = collectReadyKdsNewTicketAlertGroups({
    tickets,
    pendingTicketIds: new Set([201, 202, 203, 204]),
    orderItemById: new Map([
      [2001, makeItem({ id: 2001, order_id: 20 })],
      [2002, makeItem({ id: 2002, order_id: 20 })],
      [2003, makeItem({ id: 2003, order_id: 20 })],
      [2004, makeItem({ id: 2004, order_id: 20 })],
    ]),
    kitchenBatches: new Map([
      [43, makeBatch("append", { id: 43, order_id: 20 })],
      [44, makeBatch("append", { id: 44, order_id: 20 })],
    ]),
  });

  assert.deepEqual(
    groups.map((group) => group.groupKey),
    ["order:20", "batch:43", "batch:44"],
  );
  assert.deepEqual(groups[0]?.ticketIds, [201, 202]);
});

test("KDS mixed batch emits one alert and uses the highest-priority tone", () => {
  const tickets = [
    makeTicket({ id: 301, order_item_id: 3001, kitchen_send_batch_id: 45 }),
    makeTicket({ id: 302, order_item_id: 3002, kitchen_send_batch_id: 45 }),
  ];
  const groups = collectReadyKdsNewTicketAlertGroups({
    tickets,
    pendingTicketIds: new Set([301, 302]),
    orderItemById: new Map([
      [3001, makeItem({ id: 3001 })],
      [
        3002,
        makeItem({
          id: 3002,
          category_name: "Thêm",
          category_type: "side_dish",
        }),
      ],
    ]),
    kitchenBatches: new Map([[45, makeBatch("append", { id: 45 })]]),
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.tone, "kds-add-on");
});

test("KDS alert grouping waits for item and batch metadata", () => {
  const ticket = makeTicket({
    id: 401,
    order_item_id: 4001,
    kitchen_send_batch_id: 46,
  });

  assert.equal(
    collectReadyKdsNewTicketAlertGroups({
      tickets: [ticket],
      pendingTicketIds: new Set([401]),
      orderItemById: new Map(),
      kitchenBatches: new Map([[46, makeBatch("initial", { id: 46 })]]),
    }).length,
    0,
  );
  assert.equal(
    collectReadyKdsNewTicketAlertGroups({
      tickets: [ticket],
      pendingTicketIds: new Set([401]),
      orderItemById: new Map([[4001, makeItem({ id: 4001 })]]),
      kitchenBatches: new Map(),
    }).length,
    0,
  );
  assert.equal(
    collectReadyKdsNewTicketAlertGroups({
      tickets: [ticket],
      pendingTicketIds: new Set([401]),
      orderItemById: new Map([[4001, makeItem({ id: 4001 })]]),
      kitchenBatches: new Map([[46, makeBatch("initial", { id: 46 })]]),
    }).length,
    1,
  );
});

test("KDS alert grouping ignores inactive pending tickets", () => {
  const groups = collectReadyKdsNewTicketAlertGroups({
    tickets: [
      makeTicket({ id: 501, order_item_id: 5001, status: "ready" }),
      makeTicket({ id: 502, order_item_id: 5002, status: "cancelled" }),
    ],
    pendingTicketIds: new Set([501, 502]),
    orderItemById: new Map([
      [5001, makeItem({ id: 5001 })],
      [5002, makeItem({ id: 5002 })],
    ]),
    kitchenBatches: new Map([[1, makeBatch("initial")]]),
  });

  assert.equal(groups.length, 0);
});
