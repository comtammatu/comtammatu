import test from "node:test";
import assert from "node:assert/strict";
import {
  getLegalVersionForPeriod,
  PAYROLL_LEGAL_VERSIONS,
} from "../legal-versions";
import { calculatePayrollEntry } from "../calculate";

test("2026 tax year is 5-bracket every month (Luật 109/2025 từ kỳ tính thuế 2026)", () => {
  for (let m = 1; m <= 12; m++) {
    const v = getLegalVersionForPeriod(2026, m);
    assert.equal(
      v.pitBrackets.length,
      5,
      `2026-${m} must use the 5-bracket schedule`,
    );
    assert.equal(v.personalDeduction, 15_500_000, `2026-${m} personal deduction`);
    assert.equal(v.dependentDeduction, 6_200_000, `2026-${m} dependent deduction`);
  }
});

test("BHXH cap steps 46.8M → 50.6M at 2026-07 (NĐ 161/2026)", () => {
  const june = getLegalVersionForPeriod(2026, 6);
  const july = getLegalVersionForPeriod(2026, 7);
  assert.equal(june.effectiveFrom, "2026-01-01");
  assert.equal(july.effectiveFrom, "2026-07-01");
  assert.equal(june.insuranceCap, 46_800_000); // lương cơ sở 2.34M × 20
  assert.equal(july.insuranceCap, 50_600_000); // lương cơ sở 2.53M × 20
});

test("closed periods (≤2025) stay byte-stable for reproducibility", () => {
  // Pre-2026 finalization uses the 7-bracket schedule + old caps; must not drift.
  const y2024 = getLegalVersionForPeriod(2024, 12);
  assert.equal(y2024.effectiveFrom, "2024-07-01");
  assert.equal(y2024.pitBrackets.length, 7);
  assert.equal(y2024.personalDeduction, 11_000_000);
  assert.equal(y2024.dependentDeduction, 4_400_000);
  assert.equal(y2024.insuranceCap, 46_800_000);

  const y2020 = getLegalVersionForPeriod(2020, 12);
  assert.equal(y2020.effectiveFrom, "2020-07-01");
  assert.equal(y2020.insuranceCap, 29_800_000);
});

test("BHXH cap step changes contributions for a base above 46.8M at 06↔07 2026", () => {
  const base = {
    grossTotal: 60_000_000,
    insuranceBaseSalary: 50_000_000, // above 46.8M, below 50.6M
    taxExemptAllowances: 0,
    dependentCount: 0,
    charityDeduction: 0,
    advanceDeduction: 0,
    otherDeductions: 0,
  };
  const june = calculatePayrollEntry({ ...base, effectiveDate: "2026-06-30" });
  const july = calculatePayrollEntry({ ...base, effectiveDate: "2026-07-31" });
  // June capped at 46.8M; July at the actual 50M base (below the new 50.6M cap).
  assert.equal(june.insuranceBase, 46_800_000);
  assert.equal(july.insuranceBase, 50_000_000);
  assert.ok(
    july.totalInsuranceEmployee > june.totalInsuranceEmployee,
    "higher cap → higher employee contribution in July",
  );
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
