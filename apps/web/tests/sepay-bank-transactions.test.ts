import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapSepayWebhookRow,
  sumSepayBankMovementSince,
  type SepayWebhookRow,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

function row(
  id: number,
  payload: Record<string, unknown>,
  createdAt = "2026-07-01T01:00:00.000Z",
): SepayWebhookRow {
  return {
    id,
    request_id: String(id),
    created_at: createdAt,
    processing_status: "processed",
    error_code: null,
    payment_id: null,
    payload,
  };
}

test("SePay bank transaction maps incoming and outgoing webhook payloads", () => {
  const incoming = mapSepayWebhookRow(
    row(1, {
      transactionDate: "2026-07-01 08:30:00",
      accountNumber: "123456",
      content: "DHABC123",
      transferType: "in",
      transferAmount: "150000",
      accumulated: "1150000",
      referenceCode: "FT001",
    }),
  );
  const outgoing = mapSepayWebhookRow(
    row(2, {
      transactionDate: "2026-07-01 09:00:00",
      transferType: "out",
      transferAmount: 40000,
    }),
  );

  assert.equal(incoming?.transferType, "in");
  assert.equal(incoming?.amount, 150000);
  assert.equal(incoming?.accumulated, 1150000);
  assert.equal(outgoing?.transferType, "out");
  assert.equal(outgoing?.amount, 40000);
});

test("SePay bank movement sums plus and minus from opening date", () => {
  const movement = sumSepayBankMovementSince(
    [
      row(1, {
        transactionDate: "2026-06-30 23:59:00",
        transferType: "in",
        transferAmount: 999999,
      }),
      row(2, {
        transactionDate: "2026-07-01 08:30:00",
        transferType: "in",
        transferAmount: 150000,
      }),
      row(3, {
        transactionDate: "2026-07-01 09:00:00",
        transferType: "out",
        transferAmount: 40000,
      }),
    ],
    "2026-07-01",
  );

  assert.deepEqual(movement, { inAmount: 150000, outAmount: 40000 });
});
