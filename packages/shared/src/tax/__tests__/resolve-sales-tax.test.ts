import test from "node:test";
import assert from "node:assert/strict";
import {
  getSalesTaxVersionFor,
  resolveSalesTaxProfile,
  ONE_BILLION,
  THREE_BILLION,
} from "../resolve-sales-tax";

test("≤1 tỷ exempt on any date (rate 0, vatExempt, tncn exempt)", () => {
  for (const date of ["2026-06-16", "2027-01-01", "2030-12-31"]) {
    const p = resolveSalesTaxProfile({
      annualRevenue: 800_000_000,
      effectiveDate: date,
    });
    assert.equal(p.group, "exempt");
    assert.equal(p.vatExempt, true);
    assert.equal(p.gtgtRate, 0);
    assert.equal(p.tncnMode, "exempt");
    assert.equal(p.tncnRate, 0);
    assert.equal(p.tempReductionApplied, false);
  }
});

test("group2 in-window (2026-06-16) → gtgtRate 2.4, tncn revenue_percent 0.015", () => {
  const p = resolveSalesTaxProfile({
    annualRevenue: 2_000_000_000,
    effectiveDate: "2026-06-16",
  });
  assert.equal(p.group, "group2");
  assert.equal(p.vatExempt, false);
  assert.equal(p.gtgtRate, 2.4);
  assert.equal(p.tempReductionApplied, true);
  assert.equal(p.tncnMode, "revenue_percent");
  assert.equal(p.tncnRate, 0.015);
});

test("group2 after window expires (2027-01-01) → gtgtRate 3.0, SAME version, tempReductionApplied false", () => {
  const p = resolveSalesTaxProfile({
    annualRevenue: 2_000_000_000,
    effectiveDate: "2027-01-01",
  });
  assert.equal(p.group, "group2");
  assert.equal(p.gtgtRate, 3.0);
  assert.equal(p.tempReductionApplied, false);
  // window expiry does NOT introduce a new version
  assert.equal(p.versionEffectiveFrom, "2026-01-01");
  assert.equal(getSalesTaxVersionFor("2027-01-01").effectiveFrom, "2026-01-01");
});

test("boundary exactly at 1_000_000_000 → group2 (min inclusive)", () => {
  const p = resolveSalesTaxProfile({
    annualRevenue: ONE_BILLION,
    effectiveDate: "2026-06-16",
  });
  assert.equal(p.group, "group2");
  assert.equal(p.vatExempt, false);
});

test("group3 (>3 tỷ) → tncnMode net_income 0.17, gtgtRate 2.4 in-window", () => {
  const p = resolveSalesTaxProfile({
    annualRevenue: 4_000_000_000,
    effectiveDate: "2026-06-16",
  });
  assert.equal(p.group, "group3");
  assert.equal(p.tncnMode, "net_income");
  assert.equal(p.tncnRate, 0.17);
  assert.equal(p.gtgtRate, 2.4);
  assert.equal(p.tempReductionApplied, true);
});

test("boundary exactly at 3_000_000_000 → group3 (min inclusive)", () => {
  const p = resolveSalesTaxProfile({
    annualRevenue: THREE_BILLION,
    effectiveDate: "2026-06-16",
  });
  assert.equal(p.group, "group3");
});

test("alcoholic_beverage vs food_service both 3.0/2.4 under direct method", () => {
  const food = resolveSalesTaxProfile({
    annualRevenue: 2_000_000_000,
    effectiveDate: "2026-06-16",
    category: "food_service",
  });
  const alcohol = resolveSalesTaxProfile({
    annualRevenue: 2_000_000_000,
    effectiveDate: "2026-06-16",
    category: "alcoholic_beverage",
  });
  assert.equal(food.gtgtRate, 2.4);
  assert.equal(alcohol.gtgtRate, 2.4);

  const foodAfter = resolveSalesTaxProfile({
    annualRevenue: 2_000_000_000,
    effectiveDate: "2027-01-01",
    category: "food_service",
  });
  const alcoholAfter = resolveSalesTaxProfile({
    annualRevenue: 2_000_000_000,
    effectiveDate: "2027-01-01",
    category: "alcoholic_beverage",
  });
  assert.equal(foodAfter.gtgtRate, 3.0);
  assert.equal(alcoholAfter.gtgtRate, 3.0);
});

test("prod-realistic case: annualRevenue 620_000_000 on 2026-06-16 → exempt/0", () => {
  const p = resolveSalesTaxProfile({
    annualRevenue: 620_000_000,
    effectiveDate: "2026-06-16",
  });
  assert.equal(p.group, "exempt");
  assert.equal(p.vatExempt, true);
  assert.equal(p.gtgtRate, 0);
  assert.equal(p.tncnMode, "exempt");
  assert.equal(p.tncnRate, 0);
});

test("version lookup falls back to earliest when before all versions", () => {
  // mirrors payroll getLegalVersionFor: never throws for an early date,
  // returns the earliest registered version
  assert.equal(getSalesTaxVersionFor("2020-01-01").effectiveFrom, "2026-01-01");
});
