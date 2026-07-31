import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canCorrectExpensePaymentMethod } from "../app/(protected)/finance/_lib/expense-categories";

describe("canCorrectExpensePaymentMethod", () => {
  test("allows unmatched cash/transfer/unpaid operating expenses", () => {
    assert.equal(
      canCorrectExpensePaymentMethod({
        category: "utilities",
        payment_method: "cash",
        paid_at: "2026-08-01T00:00:00Z",
        transfer_content: null,
        matchedEventIds: [],
        matchedBankTransactionIds: [],
      }),
      true,
    );
    assert.equal(
      canCorrectExpensePaymentMethod({
        category: "rent",
        payment_method: "transfer",
        paid_at: "2026-08-01T00:00:00Z",
        transfer_content: null,
        matchedEventIds: [],
      }),
      true,
    );
    assert.equal(
      canCorrectExpensePaymentMethod({
        category: "other",
        payment_method: "unpaid",
        paid_at: null,
        transfer_content: null,
        matchedEventIds: [],
      }),
      true,
    );
  });

  test("blocks matched, bank_deposit, and transfer-content intents", () => {
    assert.equal(
      canCorrectExpensePaymentMethod({
        category: "utilities",
        payment_method: "transfer",
        paid_at: "2026-08-01T00:00:00Z",
        matchedEventIds: [1],
      }),
      false,
    );
    assert.equal(
      canCorrectExpensePaymentMethod({
        category: "bank_deposit",
        payment_method: "transfer",
        paid_at: "2026-08-01T00:00:00Z",
        matchedEventIds: [],
      }),
      false,
    );
    assert.equal(
      canCorrectExpensePaymentMethod({
        category: "utilities",
        payment_method: "unpaid",
        paid_at: null,
        transfer_content: "MATU CHI 1",
        matchedEventIds: [],
      }),
      false,
    );
  });
});
