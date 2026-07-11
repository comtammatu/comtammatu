import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";

const payrollActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/payroll-actions.ts"),
  "utf8",
);
const payrollMessagesSource = readFileSync(
  join(process.cwd(), "lib/messages/hr.ts"),
  "utf8",
);
const annualLeaveMigrationSource = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260626102342_hr_payroll_annual_leave.sql",
  ),
  "utf8",
);
const contractInsuranceMigrationSource = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260626144240_hr_contracts_insurance_payroll.sql",
  ),
  "utf8",
);
const monthlyAnnualLeaveMigrationSource = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260708050914_hr_leave_monthly_annual_policy.sql",
  ),
  "utf8",
);

const payrollActionsCode = payrollActionsSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

test("Payroll source: active contract first, employee row fallback", () => {
  assert.ok(payrollActionsSource, "payroll action source should load");
  for (const expected of [
    "insurance_base_salary, dependents_count",
    'from("employment_contracts")',
    "contractByEmployee",
    "contract?.gross_salary ?? emp.base_salary ?? 0",
    "contract?.insurance_base_salary ?? emp.insurance_base_salary ?? 0",
    "insuranceBaseSalary,",
  ]) {
    assert.ok(
      payrollActionsSource.includes(expected),
      `expected calculatePayroll to include ${expected}`,
    );
  }
  assert.doesNotMatch(
    payrollActionsSource,
    /insuranceBaseSalary: 0,/,
    "BHXH must come from contract/employee insurance base, not literal 0",
  );
});

test("HKD payroll: standardDays === 0 guard", () => {
  assert.match(
    payrollActionsSource,
    /\.select\("id, period_month, period_year, standard_days, status"\)/,
    "calculatePayroll must read owner-entered standard_days from payroll_periods",
  );
  assert.match(
    payrollActionsSource,
    /if \(standardDays === 0\) \{[\s\S]*?payrollActionCopy\.calculate\.missingStandardDays/,
    "calculatePayroll must guard against a zero standard-day period",
  );
  assert.match(
    payrollMessagesSource,
    /missingStandardDays: "Kỳ lương không có ngày công chuẩn\."/,
    "the zero standard-day guard must keep an operator-facing message",
  );
  assert.doesNotMatch(
    payrollActionsSource,
    /getUTCDay\(\)|daysInMonth|for \(let d = 1; d <=/,
    "payroll must not auto-count weekday standard days",
  );
});

test("HKD payroll: attendance and leave day snapshots are explicit", () => {
  for (const expected of [
    '.select("employee_id, date, check_out")',
    "buildCompletedWorkdays",
    "countAnnualLeaveAccruedThroughMonth",
    "calculateAnnualLeaveUsedThroughMonth",
    "splitAnnualLeaveByQuota",
    "calculatePayableDays",
    "paid_leave_days: paidLeaveDays",
    "unpaid_leave_days: unpaidLeaveDays",
    "payable_days: payableDays",
  ]) {
    assert.ok(
      payrollActionsSource.includes(expected),
      `expected calculatePayroll to include ${expected}`,
    );
  }
  assert.doesNotMatch(
    payrollActionsSource,
    /\.from\("annual_leave_entitlements"\)/,
    "payroll leave accrual must not read stale year-level annual entitlement rows",
  );
});

test("HKD payroll: list queries are bounded", () => {
  assert.match(
    payrollActionsSource,
    /\.limit\(60\)/,
    "fetchPayrollPeriods must cap results",
  );
});

test("HKD payroll: calculate persists via one atomic RPC", () => {
  assert.match(
    payrollActionsSource,
    /\.rpc\(\s*"upsert_payroll_calculation"/,
    "calculatePayroll must persist entries + status via the atomic RPC",
  );
  assert.doesNotMatch(
    payrollActionsCode,
    /\.update\(\s*\{\s*status:\s*"calculated"/,
    "the separate payroll_periods.status='calculated' write must be folded into the RPC",
  );
});

test("HKD payroll: calculate reports employeeCount from the RPC result", () => {
  assert.match(
    payrollActionsSource,
    /employee_count\s*\?\?\s*entries\.length/,
    "meta.employeeCount must read the RPC's persisted-row count (regression for the calculated(0) toast)",
  );
});

test("HKD payroll migration adds annual leave quota and payroll day snapshots", () => {
  for (const expected of [
    "CREATE TABLE public.annual_leave_entitlements",
    "CONSTRAINT annual_leave_entitlements_employee_year_key UNIQUE",
    "ADD COLUMN standard_days numeric(5,1)",
    "ADD COLUMN paid_leave_days numeric(5,1)",
    "ADD COLUMN unpaid_leave_days numeric(5,1)",
    "ADD COLUMN payable_days numeric(5,1)",
    "pg_advisory_xact_lock(v_request.employee_id)",
    "annual leave quota exceeded",
    "working_days, paid_leave_days, unpaid_leave_days, payable_days",
    "paid_leave_days = EXCLUDED.paid_leave_days",
    "unpaid_leave_days = EXCLUDED.unpaid_leave_days",
    "payable_days = EXCLUDED.payable_days",
  ]) {
    assert.ok(
      annualLeaveMigrationSource.includes(expected),
      `expected annual leave migration to include ${expected}`,
    );
  }
});

test("HKD leave approval migration allows payroll to split unpaid overflow", () => {
  assert.match(
    monthlyAnnualLeaveMigrationSource,
    /CREATE OR REPLACE FUNCTION public\.approve_leave_request/,
  );
  assert.match(
    monthlyAnnualLeaveMigrationSource,
    /pg_advisory_xact_lock\(v_request\.employee_id\)/,
  );
  assert.match(monthlyAnnualLeaveMigrationSource, /SET status = 'approved'/);
  assert.doesNotMatch(
    monthlyAnnualLeaveMigrationSource,
    /annual leave quota exceeded/,
  );
});

test("Contract insurance migration opens HĐLĐ writes and syncs BHXH cache", () => {
  for (const expected of [
    "CREATE POLICY contracts_write",
    "hr:manage_employee",
    "UPDATE OF status, gross_salary, insurance_base_salary, start_date, end_date",
    "latest_active_contract",
    "insurance_base_salary = latest_active_contract.insurance_base_salary",
  ]) {
    assert.ok(
      contractInsuranceMigrationSource.includes(expected),
      `expected contract insurance migration to include ${expected}`,
    );
  }
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

test("BHXH engine: 25M gross and insurance base → NLĐ pays 10.5%", () => {
  const r = calculatePayrollEntry({
    ...HKD,
    grossTotal: 25_000_000,
    insuranceBaseSalary: 25_000_000,
    dependentCount: 1,
  });
  assert.equal(r.totalInsuranceEmployee, 2_625_000);
  assert.equal(r.totalInsuranceEmployer, 5_375_000);
  assert.equal(r.taxableIncome, 675_000);
  assert.equal(r.pitTax, 33_750);
  assert.equal(r.netSalary, 22_341_250);
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
