import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KDS_ACTIVE_STATUSES,
  KDS_DONE_STATUSES,
  KDS_VISIBLE_STATUSES,
  compareKdsDoneOrdersDesc,
  orderHasKitchenWork,
  orderIsKitchenDone,
} from "../app/(protected)/br/[branchId]/kds/lib/ticket-status";
import type { KdsTicket } from "../app/(protected)/br/[branchId]/kds/types";

function makeTicket(overrides: Partial<KdsTicket> = {}): KdsTicket {
  return {
    id: overrides.id ?? 1,
    station_id: overrides.station_id ?? 1,
    order_id: overrides.order_id ?? 1,
    order_item_id: overrides.order_item_id ?? 10,
    kitchen_send_batch_id: overrides.kitchen_send_batch_id ?? null,
    status: overrides.status ?? "pending",
    bumped_at: overrides.bumped_at ?? null,
    created_at: overrides.created_at ?? "2026-05-26T02:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-26T02:00:00.000Z",
  };
}

test("KDS done review uses ready tickets without widening active statuses", () => {
  assert.deepEqual([...KDS_ACTIVE_STATUSES], ["pending", "preparing"]);
  assert.deepEqual([...KDS_DONE_STATUSES], ["ready"]);
  assert.deepEqual(
    [...KDS_VISIBLE_STATUSES],
    ["pending", "preparing", "ready"],
  );
});

test("KDS active and done sections stay mutually exclusive", () => {
  const activeTickets = [
    makeTicket({ status: "ready" }),
    makeTicket({ id: 2, status: "preparing" }),
  ];
  const doneTickets = [makeTicket({ status: "ready" })];

  assert.equal(orderHasKitchenWork(activeTickets), true);
  assert.equal(orderIsKitchenDone(activeTickets), false);
  assert.equal(orderHasKitchenWork(doneTickets), false);
  assert.equal(orderIsKitchenDone(doneTickets), true);
});

test("KDS done review sorts by latest kitchen completion time", () => {
  const older = {
    groupKey: "older",
    tickets: [
      makeTicket({
        status: "ready",
        bumped_at: "2026-05-26T02:05:00.000Z",
      }),
    ],
  };
  const newer = {
    groupKey: "newer",
    tickets: [
      makeTicket({
        status: "ready",
        bumped_at: "2026-05-26T02:08:00.000Z",
      }),
    ],
  };

  assert.deepEqual(
    [older, newer]
      .sort(compareKdsDoneOrdersDesc)
      .map((order) => order.groupKey),
    ["newer", "older"],
  );
});
