import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeOrderKdsEvidence } from "../app/(protected)/orders/_lib/order-kds-evidence";

test("order KDS summary counts item quantity once across recall and completion", () => {
  const result = summarizeOrderKdsEvidence([
    {
      event_type: "completed",
      ticket_id: 11,
      order_item_id: 21,
      item_snapshot: { quantity: 2 },
      context: {},
    },
    {
      event_type: "recalled",
      ticket_id: 11,
      order_item_id: 21,
      item_snapshot: { quantity: 2 },
      context: {},
    },
    {
      event_type: "completed",
      ticket_id: 11,
      order_item_id: 21,
      item_snapshot: { quantity: 2 },
      context: {},
    },
  ]);

  assert.deepEqual(result, {
    completedTicketCount: 1,
    completedItemQuantity: 2,
    legacyCompletedTicketCount: 0,
    legacyCompletedItemQuantity: 0,
  });
});

test("canonical completion supersedes the same cutover snapshot", () => {
  const result = summarizeOrderKdsEvidence([
    {
      event_type: "completed",
      ticket_id: 12,
      order_item_id: 22,
      item_snapshot: { quantity: 3 },
      context: { evidence_source: "legacy_live_snapshot" },
    },
    {
      event_type: "completed",
      ticket_id: 12,
      order_item_id: 22,
      item_snapshot: { quantity: 3 },
      context: {},
    },
    {
      event_type: "completed",
      ticket_id: 13,
      order_item_id: 23,
      item_snapshot: { quantity: 1 },
      context: { evidence_source: "legacy_live_snapshot" },
    },
  ]);

  assert.deepEqual(result, {
    completedTicketCount: 1,
    completedItemQuantity: 3,
    legacyCompletedTicketCount: 1,
    legacyCompletedItemQuantity: 1,
  });
});
