import test from "node:test";
import assert from "node:assert/strict";
import {
  getLegalVersionForPeriod,
  PAYROLL_LEGAL_VERSIONS,
} from "../legal-versions";
import { calculatePayrollEntry } from "../calculate";

test("version lookup: ≤2026-06 = 7-bracket, ≥2026-07 = 5-bracket (Luật 109/2025)", () => {
  const june = getLegalVersionForPeriod(2026, 6);
  const july = getLegalVersionForPeriod(2026, 7);
  assert.equal(june.effectiveFrom, "2026-01-01");
  assert.equal(july.effectiveFrom, "2026-07-01");
  assert.equal(june.pitBrackets.length, 7);
  assert.equal(july.pitBrackets.length, 5);
  // deductions + BHXH cap unchanged across the bracket reform
  assert.equal(july.personalDeduction, 15_500_000);
  assert.equal(july.dependentDeduction, 6_200_000);
  assert.equal(july.insuranceCap, 46_800_000);
});

test("5-bracket PIT quick-formula matches Luật 109/2025 at every cut", () => {
  const v = getLegalVersionForPeriod(2026, 7);
  const pit = (taxable: number) => {
    for (const b of v.pitBrackets) {
      if (taxable <= b.limit) return Math.round(taxable * b.rate - b.deduction);
    }
    return 0;
  };
  assert.equal(pit(10_000_000), 500_000); // 10M @ 5%
  assert.equal(pit(30_000_000), 2_500_000); // 30M: 3M − 0.5M
  assert.equal(pit(60_000_000), 8_500_000); // 60M: 12M − 3.5M
  assert.equal(pit(100_000_000), 20_500_000); // 100M: 30M − 9.5M
  assert.equal(pit(150_000_000), 38_000_000); // 150M: 52.5M − 14.5M
});

test("every registered bracket schedule is continuous (no gap at boundaries)", () => {
  for (const v of PAYROLL_LEGAL_VERSIONS) {
    const b = v.pitBrackets;
    for (let i = 0; i + 1 < b.length; i++) {
      const limit = b[i]!.limit;
      const below = limit * b[i]!.rate - b[i]!.deduction;
      const above = limit * b[i + 1]!.rate - b[i + 1]!.deduction;
      assert.ok(
        Math.abs(below - above) < 1,
        `discontinuity at ${limit} in version ${v.effectiveFrom}`,
      );
    }
  }
});

test("calculatePayrollEntry snapshots the version resolved by effectiveDate", () => {
  const base = {
    grossTotal: 50_000_000,
    insuranceBaseSalary: 20_000_000,
    taxExemptAllowances: 0,
    dependentCount: 0,
    charityDeduction: 0,
    advanceDeduction: 0,
    otherDeductions: 0,
  };
  assert.equal(
    calculatePayrollEntry({ ...base, effectiveDate: "2026-06-30" })
      .legalVersionEffectiveFrom,
    "2026-01-01",
  );
  assert.equal(
    calculatePayrollEntry({ ...base, effectiveDate: "2026-07-31" })
      .legalVersionEffectiveFrom,
    "2026-07-01",
  );
});
