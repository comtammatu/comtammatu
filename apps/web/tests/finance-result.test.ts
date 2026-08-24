import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateBranchDayFinanceResult,
  calculateFinanceResult,
} from "../app/(protected)/finance/_lib/finance-result";
import { parseFinanceOperatingCockpitRpc } from "../app/(protected)/finance/_lib/finance-operating-rpc";

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
  assert.equal(missingPosCoverage.grossProfit, 420_000);
  assert.equal(missingPosCoverage.grossMargin, 70);
  assert.equal(missingPosCoverage.operatingResult, 200_000);

  assert.equal(
    calculateFinanceResult({
      netRevenueBeforeVat: 600_000,
      goodsIn: 200_000,
      ingredientCost: 180_000,
      operatingExpense: 250_000,
      inventoryChange: 50_000,
      costAvailable: false,
      operatingExpenseRecorded: true,
      costReadable: false,
    }).grossProfit,
    null,
  );

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

test("branch-day KQKD keeps 0 opex and blanks only when valuation is inactive", () => {
  const zeroOpex = calculateBranchDayFinanceResult({
    netRevenueBeforeVat: 600_000,
    goodsIn: 200_000,
    ingredientCost: 180_000,
    operatingExpense: 0,
    inventoryChange: 50_000,
    costAvailable: true,
    valuationActive: true,
  });
  assert.equal(zeroOpex.grossProfit, 420_000);
  assert.equal(zeroOpex.operatingResult, 450_000);

  const missingCoverage = calculateBranchDayFinanceResult({
    netRevenueBeforeVat: 600_000,
    goodsIn: 200_000,
    ingredientCost: 180_000,
    operatingExpense: 0,
    inventoryChange: 50_000,
    costAvailable: false,
    valuationActive: true,
  });
  assert.equal(missingCoverage.grossProfit, 420_000);
  assert.equal(missingCoverage.operatingResult, 450_000);

  const noValuation = calculateBranchDayFinanceResult({
    netRevenueBeforeVat: 600_000,
    goodsIn: 200_000,
    ingredientCost: 180_000,
    operatingExpense: 0,
    inventoryChange: 50_000,
    costAvailable: true,
    valuationActive: false,
  });
  assert.equal(noValuation.grossProfit, null);
  assert.equal(noValuation.operatingResult, null);
});

test("cockpit parser derives inventory change from pre-migration payloads", () => {
  // Minimal OLD-shape payload: no inventory_change / inventory_change_included
  // / valuation_active keys, as emitted before the identity migration.
  const oldShapePayload = {
    net_revenue: "600000.00",
    subtotal_revenue: "650000.00",
    discount_amount: "50000.00",
    order_count: 120,
    cash_revenue: "400000.00",
    vietqr_revenue: "200000.00",
    food_cost: {
      valuation_active: true,
      ingredient_cost: "180000.00",
      operating_consumption: "20000.00",
      paid_order_count: 120,
      covered_order_count: 120,
      coverage_complete: true,
    },
    goods_in: "200000.00",
    goods_in_kind: "inventory_purchase",
    operating_expense_total: "250000.00",
    operating_expense_recorded: true,
    inventory_opening: "1000000.00",
    inventory_closing: "1250000.00",
    inventory_readable: true,
    exceptions: {
      cash_variance_abs: "0.00",
      cash_variance_sessions: 0,
      cash_variance_session_id: null,
      cash_variance_branch_id: null,
      unpaid_ap_count: 0,
      unpaid_ap_amount: "0.00",
      payment_desync_count: 0,
      payment_desync_amount: "0.00",
      invoice_attention_count: 0,
      unmatched_bank_count: 0,
      unmatched_bank_amount: "0.00",
      missing_vietqr_count: 0,
      missing_vietqr_amount: "0.00",
    },
  };

  const oldShape = parseFinanceOperatingCockpitRpc(oldShapePayload);
  assert.notEqual(oldShape, null);
  assert.equal(oldShape?.inventoryChange, 1_250_000 - 1_000_000);
  assert.equal(
    oldShape?.inventoryChange,
    (oldShape?.inventoryClosing ?? 0) - (oldShape?.inventoryOpening ?? 0),
  );
  assert.equal(oldShape?.inventoryChangeIncluded, true);
  // Old-shape payload has no top-level valuation_active key, so the parser
  // must fall back to the nested food_cost.valuation_active value.
  assert.equal(
    oldShape?.valuationActive,
    oldShapePayload.food_cost.valuation_active,
  );
  assert.equal(oldShape?.valuationActive, true);

  // Old-shape company-scope payloads hard-coded food_cost.valuation_active
  // to false; the fallback must reproduce that.
  const oldShapeInactiveFoodCost = {
    ...oldShapePayload.food_cost,
    valuation_active: false,
  };
  const oldShapeInactive = parseFinanceOperatingCockpitRpc({
    ...oldShapePayload,
    food_cost: oldShapeInactiveFoodCost,
  });
  assert.notEqual(oldShapeInactive, null);
  assert.equal(
    oldShapeInactive?.valuationActive,
    oldShapeInactiveFoodCost.valuation_active,
  );
  assert.equal(oldShapeInactive?.valuationActive, false);

  // NEW-shape payload carries the server-computed identity terms verbatim.
  const newShape = parseFinanceOperatingCockpitRpc({
    ...oldShapePayload,
    inventory_change: "7.50",
    inventory_change_included: false,
    valuation_active: false,
  });
  assert.notEqual(newShape, null);
  assert.equal(newShape?.inventoryChange, 7.5);
  assert.equal(newShape?.inventoryChangeIncluded, false);
  assert.equal(newShape?.valuationActive, false);
});
