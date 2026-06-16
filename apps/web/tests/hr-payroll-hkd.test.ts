import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";

const payrollActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/payroll-actions.ts"),
  "utf8",
);

// Strip the single intentional doc comment that names employment_contracts so
// the "no live contract reference" guard below only inspects executable code.
const payrollActionsCode = payrollActionsSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

test("HKD payroll: contract-less eligibility (is_active && base_salary > 0)", () => {
  assert.match(
    payrollActionsSource,
    /\.select\("id, base_salary, dependents_count, is_active"\)/,
    "employee fetch must include is_active for the eligibility filter",
  );
  assert.match(
    payrollActionsSource,
    /emp\.is_active && Number\(emp\.base_salary \?\? 0\) > 0/,
    "eligibility must be is_active AND base_salary > 0 (no contract lookup)",
  );
});

test("HKD payroll: BHXH off via insuranceBaseSalary literal 0", () => {
  assert.match(
    payrollActionsSource,
    /insuranceBaseSalary: 0,/,
    "calculatePayrollEntry must be called with insuranceBaseSalary: 0",
  );
});

test("HKD payroll: standardDays === 0 guard", () => {
  assert.match(
    payrollActionsSource,
    /if \(standardDays === 0\) \{[\s\S]*?Kỳ lương không có ngày công chuẩn/,
    "calculatePayroll must guard against a zero standard-day period",
  );
});

test("HKD payroll: no live employment_contracts reference remains", () => {
  assert.doesNotMatch(
    payrollActionsCode,
    /employment_contracts|contractByEmployee|contractErr|\bconst contract\b/,
    "no live contract code may remain (else ReferenceError at runtime)",
  );
});

test("HKD payroll: list queries are bounded", () => {
  assert.match(
    payrollActionsSource,
    /\.limit\(60\)/,
    "fetchPayrollPeriods must cap results",
  );
});

// Regression: shared engine math under the HKD model (insuranceBaseSalary=0).
// Numbers are derived from the versioned legal tables — do NOT hardcode rates
// here; these assert the end-to-end output the action persists.
// effectiveDate 2026-06-30 resolves to the 2026 tax-year version: 15.5M personal
// / 6.2M dependent (NQ 110/2025) + 5-bracket PIT (Luật 109/2025, áp dụng từ kỳ
// tính thuế 2026).
const HKD = {
  insuranceBaseSalary: 0,
  taxExemptAllowances: 0,
  charityDeduction: 0,
  advanceDeduction: 0,
  otherDeductions: 0,
  effectiveDate: "2026-06-30",
} as const;

test("HKD engine: 12M / 0 dependents → PIT 0, BHXH 0", () => {
  const r = calculatePayrollEntry({
    ...HKD,
    grossTotal: 12_000_000,
    dependentCount: 0,
  });
  assert.equal(r.totalInsuranceEmployee, 0);
  assert.equal(r.taxableIncome, 0);
  assert.equal(r.pitTax, 0);
  assert.equal(r.netSalary, 12_000_000);
});

test("HKD engine: 25M / 1 dependent → taxable 3.3M, PIT 165k, BHXH 0", () => {
  const r = calculatePayrollEntry({
    ...HKD,
    grossTotal: 25_000_000,
    dependentCount: 1,
  });
  assert.equal(r.totalInsuranceEmployee, 0);
  assert.equal(r.taxableIncome, 3_300_000);
  assert.equal(r.pitTax, 165_000);
});

test("HKD engine: 35M / 0 dependents → taxable 19.5M, BHXH 0", () => {
  const r = calculatePayrollEntry({
    ...HKD,
    grossTotal: 35_000_000,
    dependentCount: 0,
  });
  assert.equal(r.totalInsuranceEmployee, 0);
  assert.equal(r.taxableIncome, 19_500_000);
  // 5-bracket (kỳ tính thuế 2026): 19.5M in the ≤30M @ 10% band → 19.5M×10% − 500k
  assert.equal(r.pitTax, 1_450_000);
});
