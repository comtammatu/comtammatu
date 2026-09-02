import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";
import { readSql } from "./_lib/active-sql.ts";

const payrollActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/payroll-actions.ts"),
  "utf8",
);
const payrollMessagesSource = readFileSync(
  join(process.cwd(), "lib/messages/hr.ts"),
  "utf8",
);
const leavePolicyActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/setup/leave-policy-actions.ts"),
  "utf8",
);
const annualLeaveMigrationSource = readSql(process.cwd(), "supabase/migrations/20260626102342_hr_payroll_annual_leave.sql");
const contractInsuranceMigrationSource = readSql(process.cwd(), "supabase/migrations/20260626144240_hr_contracts_insurance_payroll.sql");
const monthlyAnnualLeaveMigrationSource = readSql(process.cwd(), "supabase/migrations/20260708050914_hr_leave_monthly_annual_policy.sql");
const policyHelperBoundaryMigrationSource = readSql(process.cwd(), "supabase/migrations/20260726053209_remove_direct_auth_is_owner_policy_calls.sql");

const payrollActionsCode = payrollActionsSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

test("Payroll live preview: active contract first, employee row fallback", () => {
  assert.ok(payrollActionsSource, "payroll action source should load");
  for (const expected of [
    'from("employment_contracts")',
    "contractByEmployee",
    "contract?.gross_salary ?? employee.base_salary",
    "contract?.insurance_base_salary ?? employee.insurance_base_salary",
    "insuranceBaseSalary,",
    "calculatePayrollEntry({",
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

test("Payroll live preview validates the selected standard days", () => {
  assert.match(
    payrollActionsSource,
    /standardDays: z\.coerce\.number\(\)\.positive\(\)\.max\(31\)/,
    "the live preview must reject a zero or invalid standard-day value",
  );
  assert.match(
    payrollActionsSource,
    /export const fetchPayrollPreview = withAction/,
    "payroll should calculate a selected month directly, without creating a period first",
  );
  assert.doesNotMatch(
    payrollActionsSource,
    /getUTCDay\(\)|daysInMonth|for \(let d = 1; d <=/,
    "payroll must not auto-count weekday standard days",
  );
});

test("Payroll live preview: attendance, leave and adjustments feed the atomic snapshot", () => {
  for (const expected of [
    '"id, employee_id, date, check_in, check_out, scheduled_start_at, scheduled_end_at, shifts ( name, start_time, end_time )"',
    "buildCompletedWorkdays",
    "fetchTenantHrLeavePolicy",
    "calculateAnnualLeaveUsedThroughMonth",
    "splitAnnualLeaveByQuota",
    "annualEntitlementByEmployee",
    "calculatePayableDays",
    "paid_leave_days: entry.paidLeaveDays",
    "unpaid_leave_days: entry.unpaidLeaveDays",
    "payable_days: entry.payableDays",
    'from("payroll_adjustments")',
    '"snapshot_payroll_calculation"',
  ]) {
    assert.ok(
      payrollActionsSource.includes(expected),
      `expected calculatePayroll to include ${expected}`,
    );
  }
  assert.match(
    payrollActionsSource,
    /\.from\("annual_leave_entitlements"\)/,
    "employee/year annual entitlement rows must determine annual leave allocation",
  );
});

test("authenticated read policies keep owner checks behind has_permission", () => {
  assert.match(
    policyHelperBoundaryMigrationSource,
    /CREATE POLICY tax_invoices_select/,
  );
  assert.match(policyHelperBoundaryMigrationSource, /public\.has_permission/);
});

test("Payroll snapshot blocks unresolved preflight data on the server", () => {
  for (const expected of [
    "buildPayrollPreflight",
    "pendingLeaveEmployeeIds",
    "preview.preflight.blockers.length > 0",
    "snapshotPreflightBlocked",
  ]) {
    assert.ok(
      payrollActionsSource.includes(expected),
      `expected payroll snapshot preflight to include ${expected}`,
    );
  }
});

test("Payroll snapshot keeps finalized values separate from live estimates", () => {
  assert.match(
    payrollActionsSource,
    /finalizedByEmployee/,
    "a locked payroll month must read its saved entries",
  );
  assert.match(
    payrollActionsSource,
    /finalized: finalizedByEmployee\.get\(employee\.id\) \?\? null/,
    "the preview row must carry the finalized snapshot separately",
  );
  assert.match(
    payrollMessagesSource,
    /finalizedNet: "Thực lĩnh đã chốt"/,
    "the UI must label the finalized number differently from the live estimate",
  );
});

test("Payroll UI uses operator terms for the unclosed and closed states", () => {
  const payrollCopyStrings = [
    ...(payrollMessagesSource.match(/"(?:\\.|[^"\\])*"/gs) ?? []),
  ].join("\n");

  assert.match(
    payrollMessagesSource,
    /Tạm tính theo ngày công, nghỉ phép, mức lương và điều chỉnh trong tháng\./,
  );
  assert.match(payrollMessagesSource, /Tình trạng tính lương/);
  assert.match(payrollMessagesSource, /Đủ thông tin tính lương/);
  assert.match(payrollMessagesSource, /Lương dự kiến/);
  assert.doesNotMatch(
    payrollCopyStrings,
    /\b(?:snapshot|live|tenant|Finance)\b/i,
  );
  assert.doesNotMatch(payrollCopyStrings, /dữ liệu hiện tại|nguồn lương/i);
});

test("Payroll snapshot persists through one atomic RPC and never marks payment", () => {
  assert.match(
    payrollActionsSource,
    /\.rpc\(\s*"snapshot_payroll_calculation"/,
    "snapshot must persist the period and all entries atomically",
  );
  assert.doesNotMatch(
    payrollActionsCode,
    /\.update\(\s*\{\s*status:\s*"paid"/,
    "HR must not mark a payroll period as paid; Finance owns payment evidence",
  );
  assert.match(
    payrollActionsSource,
    /data\.branchId != null/,
    "a tenant-wide snapshot must reject a branch-filtered preview",
  );
});

test("enterprise payroll migration adds annual leave quota and payroll day snapshots", () => {
  assert.match(
    annualLeaveMigrationSource,
    /CREATE TABLE public\.annual_leave_entitlements/,
  );
});

test("enterprise leave approval migration allows payroll to split unpaid overflow", () => {
  assert.match(
    monthlyAnnualLeaveMigrationSource,
    /CREATE OR REPLACE FUNCTION public\.approve_leave_request/,
  );
  assert.match(monthlyAnnualLeaveMigrationSource, /SET status = 'approved'/);
});

test("tenant HR leave policy persists standard workdays and monthly leave", () => {
  for (const expected of [
    'from("system_settings")',
    "HR_STANDARD_WORKDAYS",
    "HR_MONTHLY_LEAVE_DAYS",
    'onConflict: "key,tenant_id"',
  ]) {
    assert.ok(
      payrollActionsSource.includes(expected) ||
        leavePolicyActionsSource.includes(expected),
      `expected tenant HR policy persistence to include ${expected}`,
    );
  }
});

test("Contract insurance migration opens HĐLĐ writes and syncs BHXH cache", () => {
  assert.match(contractInsuranceMigrationSource, /hr:manage_employee/);
});

// Regression: shared engine math when insuranceBaseSalary=0.
// Numbers are derived from the versioned legal tables — do NOT hardcode rates
// here; these assert the end-to-end output the action persists.
// effectiveDate 2026-06-30 resolves to the 2026 tax-year version: 15.5M personal
// / 6.2M dependent (NQ 110/2025) + 5-bracket PIT (Luật 109/2025, áp dụng từ kỳ
// tính thuế 2026).
const NO_INSURANCE = {
  insuranceBaseSalary: 0,
  taxExemptAllowances: 0,
  charityDeduction: 0,
  advanceDeduction: 0,
  otherDeductions: 0,
  effectiveDate: "2026-06-30",
} as const;

test("payroll engine: 12M / 0 dependents → PIT 0, BHXH 0", () => {
  const r = calculatePayrollEntry({
    ...NO_INSURANCE,
    grossTotal: 12_000_000,
    dependentCount: 0,
  });
  assert.equal(r.totalInsuranceEmployee, 0);
  assert.equal(r.taxableIncome, 0);
  assert.equal(r.pitTax, 0);
  assert.equal(r.netSalary, 12_000_000);
});

test("payroll engine: 25M / 1 dependent → taxable 3.3M, PIT 165k, BHXH 0", () => {
  const r = calculatePayrollEntry({
    ...NO_INSURANCE,
    grossTotal: 25_000_000,
    dependentCount: 1,
  });
  assert.equal(r.totalInsuranceEmployee, 0);
  assert.equal(r.taxableIncome, 3_300_000);
  assert.equal(r.pitTax, 165_000);
});

test("BHXH engine: 25M gross and insurance base → NLĐ pays 10.5%", () => {
  const r = calculatePayrollEntry({
    ...NO_INSURANCE,
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

test("payroll engine: 35M / 0 dependents → taxable 19.5M, BHXH 0", () => {
  const r = calculatePayrollEntry({
    ...NO_INSURANCE,
    grossTotal: 35_000_000,
    dependentCount: 0,
  });
  assert.equal(r.totalInsuranceEmployee, 0);
  assert.equal(r.taxableIncome, 19_500_000);
  // 5-bracket (kỳ tính thuế 2026): 19.5M in the ≤30M @ 10% band → 19.5M×10% − 500k
  assert.equal(r.pitTax, 1_450_000);
});
