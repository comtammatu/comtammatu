import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import {
  buildKdsCompletionHistory,
  buildKdsCompletionHistoryFromEvents,
  buildKdsOperationalHistory,
  type KdsCompletionHistoryBatch,
  type KdsCompletionHistoryOrderInfo,
  type KdsCompletionHistoryOrderItem,
  type KdsCompletionHistoryTicket,
} from "../app/(protected)/br/[branchId]/kds/_lib/completion-history";

const actionsSource = readFileSync(
  new URL("../app/(protected)/br/[branchId]/kds/actions.ts", import.meta.url),
  "utf8",
);

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

test("KDS completion history follows the canonical route roles and branch scope", () => {
  assert.deepEqual(MODULE_ACL.kds.allowedRoles, [
    "owner",
    "chef",
    "branch_manager",
  ]);
  assert.match(
    actionsSource,
    /const KDS_ROLES = MODULE_ACL\.kds\.allowedRoles;/,
  );
  assert.match(actionsSource, /getAuthContext\(KDS_ROLES\)/);
  assert.match(
    actionsSource,
    /ctx\.claims\.branch_id !== null[\s\S]*ctx\.claims\.branch_id !== parsed\.data\.branchId/,
  );
});

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

test("KDS completion history survives live-ticket cleanup via event snapshots", () => {
  assert.match(actionsSource, /get_kds_ticket_history/);
  assert.doesNotMatch(actionsSource, /\.from\("kds_tickets"\)/);

  const [entry] = buildKdsCompletionHistoryFromEvents({
    events: [
      {
        event_id: 9001,
        event_type: "completed",
        occurred_at: "2026-05-28T03:12:00.000Z",
        actor_id: null,
        actor_name: "Bếp A",
        order_id: 10,
        ticket_id: 1,
        order_item_id: 101,
        station_id: 8,
        kitchen_send_batch_id: 501,
        from_status: "preparing",
        to_status: "ready",
        reason: null,
        item_snapshot: {
          item_name: "Cơm sườn",
          quantity: 2,
        },
        context: { kitchen_ticket_number: "BEP-001" },
        print_jobs: [],
      },
    ],
    orders,
    limit: 10,
  });

  assert.equal(entry?.kitchenTicketNumber, "BEP-001");
  assert.equal(entry?.itemQuantity, 2);
  assert.equal(entry?.items[0]?.name, "Cơm sườn");
});

test("KDS operational history keeps recall details and exact print links", () => {
  const [entry] = buildKdsOperationalHistory({
    events: [
      {
        event_id: 9002,
        event_type: "recalled",
        occurred_at: "2026-05-29T03:12:00.000Z",
        actor_id: "00000000-0000-0000-0000-000000000001",
        actor_name: "Bếp A",
        order_id: 10,
        ticket_id: 1,
        order_item_id: 101,
        station_id: 8,
        kitchen_send_batch_id: 501,
        from_status: "ready",
        to_status: "preparing",
        reason: "Làm lại",
        item_snapshot: {
          item_name: "Cơm sườn",
          quantity: 2,
          sides: [{ name: "Canh", quantity: 2 }],
          modifiers: [{ name: "Ít cơm" }],
          note: "Không hành",
        },
        context: {
          kitchen_ticket_number: "BEP-001",
          station_name: "Bếp chính",
        },
        print_jobs: [
          {
            id: 701,
            job_type: "kitchen_ticket",
            status: "printed",
            created_at: "2026-05-29T03:13:00.000Z",
          },
        ],
      },
    ],
    orders,
    limit: 10,
  });

  assert.equal(entry?.eventType, "recalled");
  assert.equal(entry?.actorName, "Bếp A");
  assert.equal(entry?.stationName, "Bếp chính");
  assert.deepEqual(entry?.sides, ["2× Canh"]);
  assert.deepEqual(entry?.modifiers, ["Ít cơm"]);
  assert.equal(entry?.printJobs[0]?.id, 701);
});
