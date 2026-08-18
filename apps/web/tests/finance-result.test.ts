import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateFinanceResult } from "../app/(protected)/finance/_lib/finance-result";

test("finance result uses goods-in plus inventory change, not POS COGS", () => {
  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 600_000,
      goodsIn: 200_000,
      ingredientCost: 180_000,
      operatingExpense: 250_000,
      inventoryChange: 50_000,
      costAvailable: true,
      operatingExpenseRecorded: true,
    }),
    {
      grossProfit: 420_000,
      grossMargin: 70,
      inventoryChange: 50_000,
      operatingResult: 200_000,
    },
  );

  assert.deepEqual(
    calculateFinanceResult({
      netRevenueBeforeVat: 600_000,
      goodsIn: 200_000,
      ingredientCost: 180_000,
      operatingExpense: 250_000,
      inventoryChange: -80_000,
      costAvailable: true,
      operatingExpenseRecorded: true,
    }),
    {
      grossProfit: 420_000,
      grossMargin: 70,
      inventoryChange: -80_000,
      operatingResult: 70_000,
    },
  );

  const missingPosCoverage = calculateFinanceResult({
    netRevenueBeforeVat: 600_000,
    goodsIn: 200_000,
    ingredientCost: 180_000,
    operatingExpense: 250_000,
    inventoryChange: 50_000,
    costAvailable: false,
    operatingExpenseRecorded: true,
  });
  assert.equal(missingPosCoverage.grossProfit, null);
  assert.equal(missingPosCoverage.grossMargin, null);
  assert.equal(missingPosCoverage.operatingResult, 200_000);

  assert.equal(
    calculateFinanceResult({
      netRevenueBeforeVat: 600_000,
      goodsIn: 200_000,
      ingredientCost: 180_000,
      operatingExpense: 0,
      inventoryChange: 50_000,
      costAvailable: true,
      operatingExpenseRecorded: false,
    }).operatingResult,
    null,
  );

  const withLowFoodCost = calculateFinanceResult({
    netRevenueBeforeVat: 600_000,
    goodsIn: 200_000,
    ingredientCost: 180_000,
    operatingExpense: 250_000,
    inventoryChange: 50_000,
    costAvailable: true,
    operatingExpenseRecorded: true,
  });
  const withHighFoodCost = calculateFinanceResult({
    netRevenueBeforeVat: 600_000,
    goodsIn: 200_000,
    ingredientCost: 1_000_000,
    operatingExpense: 250_000,
    inventoryChange: 50_000,
    costAvailable: true,
    operatingExpenseRecorded: true,
  });
  assert.equal(withLowFoodCost.operatingResult, withHighFoodCost.operatingResult);
  assert.notEqual(withLowFoodCost.grossProfit, withHighFoodCost.grossProfit);
});
