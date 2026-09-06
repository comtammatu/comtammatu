import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateGrossProfitIdentity,
  calculateFinanceResult,
  calculateBranchDayFinanceResult,
} from "../app/(protected)/finance/_lib/finance-result";
import { parsePeriodReadinessRpc } from "../app/(protected)/finance/_lib/finance-period-readiness";

test("Gross profit identity handles zero revenue cleanly without divide-by-zero", () => {
  const result = calculateGrossProfitIdentity({
    netRevenueBeforeVat: 0,
    ingredientCost: 0,
    costReadable: true,
  });
  assert.equal(result.grossProfit, 0);
  assert.equal(result.grossMargin, 0);
});

test("Gross profit identity blanks both profit and margin when valuation is inactive", () => {
  const result = calculateGrossProfitIdentity({
    netRevenueBeforeVat: 50_000_000,
    ingredientCost: 15_000_000,
    costReadable: false,
  });
  assert.equal(result.grossProfit, null);
  assert.equal(result.grossMargin, null);
});

test("Finance result blanks operating result when valuation is inactive", () => {
  const result = calculateFinanceResult({
    netRevenueBeforeVat: 50_000_000,
    goodsIn: 18_000_000,
    ingredientCost: 15_000_000,
    operatingExpense: 12_000_000,
    inventoryChange: 2_000_000,
    costAvailable: true,
    operatingExpenseRecorded: true,
    costReadable: false,
  });
  assert.equal(result.grossProfit, null);
  assert.equal(result.grossMargin, null);
  assert.equal(result.operatingResult, null);
});

test("Finance result computes operating result independently from gross profit", () => {
  // Revenue 100M, goods-in 40M, opex 25M, inventory delta +5M => KQKD = 100 - 40 - 25 + 5 = 40M.
  // Sold ingredient cost 30M => GP = 100 - 30 = 70M.
  // Notice that GP - opex + delta = 70 - 25 + 5 = 50M (WRONG, double-counts goods!).
  const result = calculateFinanceResult({
    netRevenueBeforeVat: 100_000_000,
    goodsIn: 40_000_000,
    ingredientCost: 30_000_000,
    operatingExpense: 25_000_000,
    inventoryChange: 5_000_000,
    costAvailable: true,
    operatingExpenseRecorded: true,
    costReadable: true,
  });
  assert.equal(result.grossProfit, 70_000_000);
  assert.equal(result.grossMargin, 70);
  assert.equal(result.operatingResult, 40_000_000);
});

test("Branch day finance result keeps valid 0 opex and computes result", () => {
  const result = calculateBranchDayFinanceResult({
    netRevenueBeforeVat: 20_000_000,
    goodsIn: 8_000_000,
    ingredientCost: 6_000_000,
    operatingExpense: 0,
    inventoryChange: 0,
    costAvailable: true,
    valuationActive: true,
  });
  assert.equal(result.grossProfit, 14_000_000);
  assert.equal(result.operatingResult, 12_000_000);
});

test("Readiness contract: operating_expense_missing is a warning, not a blocker", () => {
  // Simulates output from public.get_finance_period_close_readiness
  // where operating_expense_missing is filtered into warnings.
  const payload = {
    period_status: "open",
    valuation_active: true,
    blocker_count: 0,
    warning_count: 1,
    can_close: true,
    blockers: [],
    warnings: [
      {
        code: "operating_expense_missing",
        severity: "warning",
        branches: [77],
      },
    ],
  };
  const parsed = parsePeriodReadinessRpc(payload);
  assert.ok(parsed);
  assert.equal(parsed.blockerCount, 0);
  assert.equal(parsed.warningCount, 1);
  assert.equal(parsed.canClose, true);
  assert.deepEqual(parsed.warnings[0]?.branches, [77]);
});

test("Readiness contract: real blockers prevent period close", () => {
  const payload = {
    period_status: "open",
    valuation_active: false,
    blocker_count: 2,
    warning_count: 0,
    can_close: false,
    blockers: [
      { code: "valuation_inactive", severity: "blocker" },
      { code: "negative_stock", severity: "blocker", branches: [42], count: 3 },
    ],
    warnings: [],
  };
  const parsed = parsePeriodReadinessRpc(payload);
  assert.ok(parsed);
  assert.equal(parsed.blockerCount, 2);
  assert.equal(parsed.canClose, false);
  assert.equal(parsed.valuationActive, false);
});
