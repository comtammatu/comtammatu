import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateFinanceResult } from "../app/(protected)/finance/_lib/finance-result";

test("finance result only resolves when cost and operating expense data are available", () => {
  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 250_000,
      inventoryChange: 50_000,
      costAvailable: true,
      operatingExpenseRecorded: true,
    }),
    {
      grossProfit: 600_000,
      grossMargin: 60,
      inventoryChange: 50_000,
      operatingResult: 400_000,
    },
  );

  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 250_000,
      inventoryChange: -80_000,
      costAvailable: true,
      operatingExpenseRecorded: true,
    }),
    {
      grossProfit: 600_000,
      grossMargin: 60,
      inventoryChange: -80_000,
      operatingResult: 270_000,
    },
  );

  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 250_000,
      inventoryChange: 50_000,
      costAvailable: false,
      operatingExpenseRecorded: true,
    }),
    {
      grossProfit: null,
      grossMargin: null,
      inventoryChange: 50_000,
      operatingResult: null,
    },
  );

  assert.equal(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 0,
      inventoryChange: 50_000,
      costAvailable: true,
      operatingExpenseRecorded: false,
    }).operatingResult,
    null,
  );
});
