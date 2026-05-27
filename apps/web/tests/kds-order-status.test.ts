import assert from "node:assert/strict";
import { test } from "node:test";
import { getKdsOrderDisplayStatus } from "../app/(protected)/br/[branchId]/kds/lib/order-status";
import {
  getKdsTicketSequenceSortKey,
  getStatusLabel,
} from "../app/(protected)/br/[branchId]/kds/lib/status-config";
import type { KdsOrder } from "../app/(protected)/br/[branchId]/kds/types";

function makeOrder(statuses: string[]): Pick<KdsOrder, "tickets"> {
  return {
    tickets: statuses.map((status, index) => ({
      id: index + 1,
      station_id: 1,
      order_id: 1,
      order_item_id: index + 10,
      kitchen_send_batch_id: null,
      status,
      bumped_at: null,
      created_at: "2026-05-27T00:00:00.000Z",
      updated_at: "2026-05-27T00:00:00.000Z",
    })),
  };
}

test("KDS current pending order displays as preparing", () => {
  assert.equal(
    getKdsOrderDisplayStatus(makeOrder(["pending"]), { isCurrent: true }),
    "preparing",
  );
  assert.equal(getStatusLabel("preparing"), "Đang chuẩn bị");
});

test("KDS non-current pending order still displays as waiting", () => {
  assert.equal(getKdsOrderDisplayStatus(makeOrder(["pending"])), "pending");
  assert.equal(getStatusLabel("pending"), "Chờ");
});

test("KDS terminal order statuses are not overridden by current display", () => {
  assert.equal(
    getKdsOrderDisplayStatus(makeOrder(["ready"]), { isCurrent: true }),
    "ready",
  );
  assert.equal(
    getKdsOrderDisplayStatus(makeOrder(["cancelled"]), { isCurrent: true }),
    "cancelled",
  );
});

test("KDS ticket sequence sort key uses the small visible ticket number", () => {
  assert.deepEqual(getKdsTicketSequenceSortKey("PB-260525-055"), {
    primary: 55,
    secondary: 0,
  });
  assert.deepEqual(getKdsTicketSequenceSortKey("#105-2"), {
    primary: 105,
    secondary: 2,
  });
  assert.deepEqual(
    getKdsTicketSequenceSortKey(
      "KITCHEN-WITHOUT-SEQUENCE",
      "TC-20260525-025-PH",
    ),
    {
      primary: 25,
      secondary: 0,
    },
  );
});
