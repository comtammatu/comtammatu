import assert from "node:assert/strict";
import test from "node:test";
import { orderPaymentAttempts } from "../app/(protected)/orders/_lib/order-payment";

test("completed payment is canonical regardless of relation order", () => {
  const result = orderPaymentAttempts([
    {
      id: 12,
      method: "vietqr",
      amount: 100_000,
      status: "failed",
      paid_at: null,
      created_at: "2026-07-25T01:02:00.000Z",
    },
    {
      id: 11,
      method: "cash",
      amount: 100_000,
      status: "completed",
      paid_at: "2026-07-25T01:01:00.000Z",
      created_at: "2026-07-25T01:00:00.000Z",
    },
  ]);

  assert.equal(result.canonical?.id, 11);
  assert.deepEqual(
    result.attempts.map((payment) => payment.id),
    [12, 11],
  );
});

test("latest attempt is canonical when no payment completed", () => {
  const result = orderPaymentAttempts([
    {
      id: 20,
      method: "vietqr",
      amount: 50_000,
      status: "pending",
      paid_at: null,
      created_at: "2026-07-25T02:00:00.000Z",
    },
    {
      id: 21,
      method: "vietqr",
      amount: 50_000,
      status: "failed",
      paid_at: null,
      created_at: "2026-07-25T02:01:00.000Z",
    },
  ]);

  assert.equal(result.canonical?.id, 21);
});
