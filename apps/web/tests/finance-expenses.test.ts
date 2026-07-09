import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyExpensePaymentState,
  isOperatingExpenseCategory,
} from "../app/(protected)/finance/_lib/expense-categories";

test("expense payment state separates paid, unpaid, and bank-matched transfer rows", () => {
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "unpaid",
      paid_at: null,
      matchedEventIds: [],
    }),
    "unpaid",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "cash",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [],
    }),
    "cash_paid",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [],
    }),
    "transfer_needs_match",
  );
  assert.equal(
    classifyExpensePaymentState({
      payment_method: "transfer",
      paid_at: "2026-07-09T01:00:00.000Z",
      matchedEventIds: [123],
    }),
    "transfer_matched",
  );
});

test("bank deposits stay out of operating expense totals", () => {
  assert.equal(isOperatingExpenseCategory("rent"), true);
  assert.equal(isOperatingExpenseCategory("bank_deposit"), false);
  assert.equal(isOperatingExpenseCategory("cogs_manual"), false);
});
