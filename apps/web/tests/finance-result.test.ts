import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateFinanceResult } from "../app/(protected)/finance/_lib/finance-result";

test("finance result treats an available empty expense period as zero", () => {
  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 250_000,
      inventoryMovement: 50_000,
      costAvailable: true,
      operatingExpenseAvailable: true,
    }),
    {
      grossProfit: 600_000,
      grossMargin: 60,
      operatingResult: 400_000,
    },
  );

  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 250_000,
      inventoryMovement: 0,
      costAvailable: false,
      operatingExpenseAvailable: true,
    }),
    {
      grossProfit: null,
      grossMargin: null,
      operatingResult: null,
    },
  );

  assert.equal(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 0,
      inventoryMovement: 0,
      costAvailable: true,
      operatingExpenseAvailable: true,
    }).operatingResult,
    600_000,
  );

  assert.equal(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 0,
      inventoryMovement: 0,
      costAvailable: true,
      operatingExpenseAvailable: false,
    }).operatingResult,
    null,
  );

  assert.equal(
    calculateFinanceResult({
      netRevenueBeforeVat: 1_000_000,
      ingredientCost: 400_000,
      operatingExpense: 250_000,
      inventoryMovement: -50_000,
      costAvailable: true,
      operatingExpenseAvailable: true,
    }).operatingResult,
    300_000,
  );
});
