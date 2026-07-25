import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveOrderOperationalVerdict,
  summarizeOrderKdsEvidence,
  summarizeOrderItemKdsEvidence,
} from "../app/(protected)/orders/_lib/order-kds-evidence";

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

test("a recalled item is not still counted as completed", () => {
  const events = [
    {
      event_type: "completed",
      ticket_id: 14,
      order_item_id: 24,
      item_snapshot: { quantity: 2 },
      context: {},
    },
    {
      event_type: "recalled",
      ticket_id: 14,
      order_item_id: 24,
      item_snapshot: { quantity: 2 },
      context: {},
    },
  ];

  assert.deepEqual(summarizeOrderKdsEvidence(events), {
    completedTicketCount: 0,
    completedItemQuantity: 0,
    legacyCompletedTicketCount: 0,
    legacyCompletedItemQuantity: 0,
  });
  assert.deepEqual(summarizeOrderItemKdsEvidence(events).get(24), {
    state: "in_progress",
    completedQuantity: null,
    latestEventType: "recalled",
  });
});

test("per-item evidence separates completed, missing, and old kitchen history", () => {
  const result = summarizeOrderItemKdsEvidence([
    {
      event_type: "completed",
      ticket_id: 15,
      order_item_id: 25,
      occurred_at: "2026-07-25T03:10:00.000Z",
      item_snapshot: { quantity: 6 },
      context: {},
    },
    {
      event_type: "completed",
      ticket_id: 16,
      order_item_id: 26,
      occurred_at: "2026-07-25T03:11:00.000Z",
      item_snapshot: { quantity: 1 },
      context: { evidence_source: "legacy_live_snapshot" },
    },
  ]);

  assert.deepEqual(result.get(25), {
    state: "completed",
    completedQuantity: 6,
    latestEventType: "completed",
  });
  assert.deepEqual(result.get(26), {
    state: "history_incomplete",
    completedQuantity: 1,
    latestEventType: "completed",
  });
  assert.equal(result.has(27), false);
});

test("order verdict does not turn incomplete history into a false conclusion", () => {
  assert.equal(
    resolveOrderOperationalVerdict({
      orderStatus: "completed",
      itemQuantity: 26,
      legacyUnclassifiedQuantity: 26,
      kds: {
        completedTicketCount: 0,
        completedItemQuantity: 0,
        legacyCompletedTicketCount: 11,
        legacyCompletedItemQuantity: 22,
      },
      printJobCount: 11,
      printedJobCount: 11,
      missingReconciliationCount: 0,
    }),
    "history_incomplete",
  );
});

test("order verdict names payment, print, and kitchen gaps", () => {
  const base = {
    orderStatus: "completed",
    itemQuantity: 2,
    legacyUnclassifiedQuantity: 0,
    kds: {
      completedTicketCount: 1,
      completedItemQuantity: 2,
      legacyCompletedTicketCount: 0,
      legacyCompletedItemQuantity: 0,
    },
  };

  assert.equal(
    resolveOrderOperationalVerdict({
      ...base,
      printJobCount: 1,
      printedJobCount: 0,
      missingReconciliationCount: 0,
    }),
    "print_needs_review",
  );
  assert.equal(
    resolveOrderOperationalVerdict({
      ...base,
      printJobCount: 1,
      printedJobCount: 1,
      missingReconciliationCount: 1,
    }),
    "payment_needs_review",
  );
  assert.equal(
    resolveOrderOperationalVerdict({
      ...base,
      kds: {
        ...base.kds,
        completedItemQuantity: 1,
      },
      printJobCount: 1,
      printedJobCount: 1,
      missingReconciliationCount: 0,
    }),
    "kitchen_needs_review",
  );
  assert.equal(
    resolveOrderOperationalVerdict({
      ...base,
      orderStatus: "served",
      kds: {
        ...base.kds,
        completedItemQuantity: 1,
      },
      printJobCount: 1,
      printedJobCount: 1,
      missingReconciliationCount: 0,
    }),
    "kitchen_needs_review",
  );
});
