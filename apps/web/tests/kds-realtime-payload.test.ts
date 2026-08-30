import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KDS_REALTIME_TICKET_COLUMNS,
  parseKdsRealtimeTicket,
  parseKdsRealtimeTicketId,
} from "../app/(protected)/br/[branchId]/kds/_lib/realtime-ticket";

const completeTicket = {
  id: 7_301,
  station_id: 5_101,
  order_id: 8_401,
  order_item_id: 9_601,
  kitchen_send_batch_id: 6_201,
  status: "ready",
  bumped_at: "2026-08-30T12:44:51.000Z",
  created_at: "2026-08-30T12:40:00.000Z",
  updated_at: "2026-08-30T12:44:51.000Z",
};

test("KDS realtime parser accepts complete tickets with non-default identities", () => {
  assert.deepEqual(parseKdsRealtimeTicket(completeTicket), completeTicket);
  assert.deepEqual(
    parseKdsRealtimeTicket({
      ...completeTicket,
      kitchen_send_batch_id: null,
      bumped_at: null,
    }),
    {
      ...completeTicket,
      kitchen_send_batch_id: null,
      bumped_at: null,
    },
  );
});

test("KDS realtime parser fails closed when the batch identity is missing", () => {
  const { kitchen_send_batch_id: _omitted, ...missingBatchId } = completeTicket;

  assert.equal(parseKdsRealtimeTicket(missingBatchId), null);
  assert.equal(
    parseKdsRealtimeTicket({
      ...completeTicket,
      kitchen_send_batch_id: undefined,
    }),
    null,
  );
  assert.equal(
    parseKdsRealtimeTicket({
      ...completeTicket,
      kitchen_send_batch_id: "undefined",
    }),
    null,
  );
});

test("KDS realtime parser rejects missing or unsafe row identities", () => {
  assert.equal(parseKdsRealtimeTicket({ ...completeTicket, id: undefined }), null);
  assert.equal(parseKdsRealtimeTicket({ ...completeTicket, order_id: 0 }), null);
  assert.equal(
    parseKdsRealtimeTicket({
      ...completeTicket,
      order_item_id: Number.MAX_SAFE_INTEGER + 1,
    }),
    null,
  );
  assert.equal(parseKdsRealtimeTicketId({}), null);
  assert.equal(parseKdsRealtimeTicketId({ id: completeTicket.id }), completeTicket.id);
});

test("KDS realtime subscription explicitly requests every parsed ticket column", () => {
  assert.deepEqual(KDS_REALTIME_TICKET_COLUMNS, [
    "id",
    "station_id",
    "order_id",
    "order_item_id",
    "kitchen_send_batch_id",
    "status",
    "bumped_at",
    "created_at",
    "updated_at",
  ]);
});
