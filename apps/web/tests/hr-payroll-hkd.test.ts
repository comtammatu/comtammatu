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
const annualLeaveDataHistory = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260626102342_hr_payroll_annual_leave.sql",
  ),
  "utf8",
);
const contractInsuranceDataHistory = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260626144240_hr_contracts_insurance_payroll.sql",
  ),
  "utf8",
);
const baseline = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);

function pgDumpBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing pg_dump block: ${marker}`);
  const next = source.indexOf("\n\n--\n-- Name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const annualLeaveTable = pgDumpBlock(
  baseline,
  "-- Name: annual_leave_entitlements; Type: TABLE;",
);
const annualLeaveUniqueConstraint = pgDumpBlock(
  baseline,
  "-- Name: annual_leave_entitlements annual_leave_entitlements_employee_year_key; Type: CONSTRAINT;",
);
const payrollEntriesTable = pgDumpBlock(
  baseline,
  "-- Name: payroll_entries; Type: TABLE;",
);
const payrollPeriodsTable = pgDumpBlock(
  baseline,
  "-- Name: payroll_periods; Type: TABLE;",
);
const upsertPayrollCalculationFunction = pgDumpBlock(
  baseline,
  "-- Name: upsert_payroll_calculation(bigint, jsonb); Type: FUNCTION;",
);
const approveLeaveRequestFunction = pgDumpBlock(
  baseline,
  "-- Name: approve_leave_request(bigint); Type: FUNCTION;",
);
const contractsWritePolicy = pgDumpBlock(
  baseline,
  "-- Name: employment_contracts contracts_write; Type: POLICY;",
);
const contractInsuranceTrigger = pgDumpBlock(
  baseline,
  "-- Name: employment_contracts trg_contract_sync_insurance; Type: TRIGGER;",
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

test("HKD payroll baseline retains annual leave and payroll day snapshots", () => {
  assert.match(
    annualLeaveTable,
    /CREATE TABLE public\.annual_leave_entitlements/,
  );
  assert.match(
    annualLeaveUniqueConstraint,
    /ADD CONSTRAINT annual_leave_entitlements_employee_year_key UNIQUE \(tenant_id, employee_id, year\)/,
  );
  assert.match(payrollPeriodsTable, /standard_days numeric\(5,1\)/);
  for (const column of ["paid_leave_days", "unpaid_leave_days", "payable_days"]) {
    assert.match(
      payrollEntriesTable,
      new RegExp(`${column} numeric\\(5,1\\) DEFAULT 0 NOT NULL`),
    );
  }
  assert.match(
    upsertPayrollCalculationFunction,
    /working_days, paid_leave_days, unpaid_leave_days, payable_days/,
  );
  for (const column of ["paid_leave_days", "unpaid_leave_days", "payable_days"]) {
    assert.match(
      upsertPayrollCalculationFunction,
      new RegExp(`${column} = EXCLUDED\\.${column}`),
    );
  }
  assert.match(
    annualLeaveDataHistory,
    /UPDATE public\.payroll_entries\s+SET payable_days = LEAST\(working_days, standard_days\)\s+WHERE payable_days = 0;/,
    "the archived migration must retain the one-time payroll snapshot backfill",
  );
  assert.match(
    annualLeaveDataHistory,
    /INSERT INTO public\.annual_leave_entitlements \([\s\S]*?SELECT[\s\S]*?FROM public\.employees e/,
    "the archived migration must retain the one-time entitlement seed",
  );
});

test("HKD leave approval allows payroll to split unpaid overflow", () => {
  assert.match(
    approveLeaveRequestFunction,
    /CREATE FUNCTION public\.approve_leave_request/,
  );
  assert.match(
    approveLeaveRequestFunction,
    /pg_advisory_xact_lock\(v_request\.employee_id\)/,
  );
  assert.match(approveLeaveRequestFunction, /SET status = 'approved'/);
  assert.doesNotMatch(
    approveLeaveRequestFunction,
    /annual leave quota exceeded/,
  );
});

test("HĐLĐ writes stay owner-only and contract changes sync the BHXH cache", () => {
  assert.match(contractsWritePolicy, /CREATE POLICY contracts_write/);
  assert.match(contractsWritePolicy, /po\.code = 'owner'::text/);
  assert.doesNotMatch(contractsWritePolicy, /hr:manage_employee/);
  assert.match(
    contractInsuranceTrigger,
    /AFTER INSERT OR UPDATE OF status, gross_salary, insurance_base_salary, start_date, end_date/,
  );
  assert.match(
    contractInsuranceTrigger,
    /EXECUTE FUNCTION public\.trg_sync_insurance_on_contract\(\)/,
  );
  assert.match(
    contractInsuranceDataHistory,
    /WITH latest_active_contract AS \([\s\S]*?UPDATE public\.employees e[\s\S]*?insurance_base_salary = latest_active_contract\.insurance_base_salary/,
    "the archived migration must retain the one-time active-contract cache backfill",
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
