/**
 * Payroll Calculation Logic
 *
 * Salary + social insurance + PIT per Vietnamese law.
 * Ref: docs/ref/payroll-pit.md
 *
 * Constants are versioned via `legal-versions.ts`. Pass `effectiveDate`
 * (Date or ISO string) — or `periodYear` + `periodMonth` — to pick the
 * correct rule set for the payroll period being calculated.
 */

import {
  getLegalVersionFor,
  getLegalVersionForPeriod,
  PAYROLL_LEGAL_VERSIONS,
  type PayrollLegalVersion,
  type PitBracket,
} from "./legal-versions";

export { getLegalVersionFor, getLegalVersionForPeriod, PAYROLL_LEGAL_VERSIONS };
export type { PayrollLegalVersion, PitBracket };

const LATEST_VERSION =
  PAYROLL_LEGAL_VERSIONS[PAYROLL_LEGAL_VERSIONS.length - 1]!;

/**
 * Progressive PIT calculation.
 * @param taxableIncome - Taxable income (after deductions), VND/month
 * @param brackets - Tax brackets to apply. Defaults to LATEST_VERSION
 *                   brackets for backward compatibility.
 */
function calculatePIT(
  taxableIncome: number,
  brackets: readonly PitBracket[] = LATEST_VERSION.pitBrackets,
): number {
  if (taxableIncome <= 0) return 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.limit) {
      return Math.round(taxableIncome * bracket.rate - bracket.deduction);
    }
  }
  return 0; // unreachable
}

export interface PayrollEntryInput {
  /** Tổng thu nhập chịu thuế (lương + phụ cấp chịu thuế + OT + bonus) */
  grossTotal: number;
  /** Mức lương đóng BH (từ employees.insurance_base_salary) */
  insuranceBaseSalary: number;
  /** Phụ cấp miễn thuế (ăn ca, xăng xe, ...) */
  taxExemptAllowances: number;
  /** Số người phụ thuộc */
  dependentCount: number;
  /** Đóng góp từ thiện */
  charityDeduction: number;
  /** Tạm ứng lương */
  advanceDeduction: number;
  /** Khấu trừ khác */
  otherDeductions: number;
  /**
   * Effective date for legal-version lookup. Pass the period's last day
   * (or any date inside the period). Defaults to current date.
   * Mutually exclusive with `legalVersion`.
   */
  effectiveDate?: string | Date;
  /**
   * Pre-resolved legal version (override). Useful when the caller has
   * already looked up the version for the period.
   */
  legalVersion?: PayrollLegalVersion;
}

export interface PayrollEntryResult {
  // Employee insurance
  bhxhEmployee: number;
  bhytEmployee: number;
  bhtnEmployee: number;
  totalInsuranceEmployee: number;

  // Employer insurance
  bhxhEmployer: number;
  bhytEmployer: number;
  bhtnEmployer: number;
  totalInsuranceEmployer: number;

  // Deductions
  personalDeduction: number;
  dependentDeduction: number;

  // Tax
  taxableIncome: number;
  pitTax: number;

  // Net pay
  netSalary: number;

  // Insurance base actually used (after cap)
  insuranceBase: number;

  // Snapshot of which legal version was applied
  legalVersionEffectiveFrom: string;
}

/**
 * Compute one full payroll row for one employee.
 *
 * Constants are resolved from `effectiveDate` / `legalVersion` / now (in
 * that priority order). The result includes `legalVersionEffectiveFrom`
 * so callers can expose version metadata alongside the money snapshot.
 */
export function calculatePayrollEntry(
  input: PayrollEntryInput,
): PayrollEntryResult {
  const version = input.legalVersion ?? getLegalVersionFor(input.effectiveDate);

  const insuranceBase = Math.min(
    input.insuranceBaseSalary,
    version.insuranceCap,
  );

  // Employee insurance contributions
  const bhxhEmployee = Math.round(insuranceBase * version.employeeBhxhRate);
  const bhytEmployee = Math.round(insuranceBase * version.employeeBhytRate);
  const bhtnEmployee = Math.round(insuranceBase * version.employeeBhtnRate);
  const totalInsuranceEmployee = bhxhEmployee + bhytEmployee + bhtnEmployee;

  // Employer insurance contributions
  const bhxhEmployer = Math.round(insuranceBase * version.employerBhxhRate);
  const bhytEmployer = Math.round(insuranceBase * version.employerBhytRate);
  const bhtnEmployer = Math.round(insuranceBase * version.employerBhtnRate);
  const totalInsuranceEmployer = bhxhEmployer + bhytEmployer + bhtnEmployer;

  // Deductions
  const personalDeduction = version.personalDeduction;
  const dependentDeduction = input.dependentCount * version.dependentDeduction;

  // Taxable income
  const taxableIncome = Math.max(
    0,
    input.grossTotal -
      totalInsuranceEmployee -
      personalDeduction -
      dependentDeduction -
      input.charityDeduction,
  );

  const pitTax = calculatePIT(taxableIncome, version.pitBrackets);

  // Net pay
  const netSalary =
    input.grossTotal +
    input.taxExemptAllowances -
    totalInsuranceEmployee -
    pitTax -
    input.advanceDeduction -
    input.otherDeductions;

  return {
    bhxhEmployee,
    bhytEmployee,
    bhtnEmployee,
    totalInsuranceEmployee,
    bhxhEmployer,
    bhytEmployer,
    bhtnEmployer,
    totalInsuranceEmployer,
    personalDeduction,
    dependentDeduction,
    taxableIncome,
    pitTax,
    netSalary,
    insuranceBase,
    legalVersionEffectiveFrom: version.effectiveFrom,
  };
}
