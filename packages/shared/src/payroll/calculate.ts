/**
 * Payroll Calculation Logic
 *
 * Tính lương + BHXH + thuế TNCN theo luật VN.
 * Ref: docs/ref/payroll-pit.md
 *
 * Constants are versioned via `legal-versions.ts`. Pass `effectiveDate`
 * (Date or ISO string) — or `periodYear` + `periodMonth` — to pick the
 * correct rule set for the payroll period being calculated.
 *
 * The legacy `INSURANCE_CAP`, `PERSONAL_DEDUCTION`, etc. exports below
 * remain for backward compatibility and reflect the LATEST version. New
 * call sites should pass an effectiveDate / period and not rely on these.
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

/** @deprecated pass effectiveDate to calculatePayrollEntry instead */
export const INSURANCE_CAP = LATEST_VERSION.insuranceCap;
/** @deprecated pass effectiveDate to calculatePayrollEntry instead */
export const PERSONAL_DEDUCTION = LATEST_VERSION.personalDeduction;
/** @deprecated pass effectiveDate to calculatePayrollEntry instead */
export const DEPENDENT_DEDUCTION = LATEST_VERSION.dependentDeduction;

/** @deprecated read from PayrollLegalVersion instead */
export const EMPLOYEE_BHXH_RATE = LATEST_VERSION.employeeBhxhRate;
/** @deprecated read from PayrollLegalVersion instead */
export const EMPLOYEE_BHYT_RATE = LATEST_VERSION.employeeBhytRate;
/** @deprecated read from PayrollLegalVersion instead */
export const EMPLOYEE_BHTN_RATE = LATEST_VERSION.employeeBhtnRate;

/** @deprecated read from PayrollLegalVersion instead */
export const EMPLOYER_BHXH_RATE = LATEST_VERSION.employerBhxhRate;
/** @deprecated read from PayrollLegalVersion instead */
export const EMPLOYER_BHYT_RATE = LATEST_VERSION.employerBhytRate;
/** @deprecated read from PayrollLegalVersion instead */
export const EMPLOYER_BHTN_RATE = LATEST_VERSION.employerBhtnRate;

/**
 * Tính thuế TNCN theo biểu lũy tiến.
 * @param taxableIncome - Thu nhập tính thuế (sau giảm trừ), VND/tháng
 * @param brackets - Biểu thuế áp dụng. Defaults to LATEST_VERSION brackets
 *                   for backward compatibility.
 */
export function calculatePIT(
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
  // BH NLĐ
  bhxhEmployee: number;
  bhytEmployee: number;
  bhtnEmployee: number;
  totalInsuranceEmployee: number;

  // BH NSDLĐ
  bhxhEmployer: number;
  bhytEmployer: number;
  bhtnEmployer: number;
  totalInsuranceEmployer: number;

  // Giảm trừ
  personalDeduction: number;
  dependentDeduction: number;

  // Thuế
  taxableIncome: number;
  pitTax: number;

  // Lương thực lĩnh
  netSalary: number;

  // Insurance base actually used (after cap)
  insuranceBase: number;

  // Snapshot of which legal version was applied
  legalVersionEffectiveFrom: string;
}

/**
 * Tính đầy đủ một dòng payroll cho 1 nhân viên.
 *
 * Constants are resolved from `effectiveDate` / `legalVersion` / now (in
 * that priority order). The result includes `legalVersionEffectiveFrom`
 * so the caller can persist it as a snapshot for audit + reproducibility.
 */
export function calculatePayrollEntry(
  input: PayrollEntryInput,
): PayrollEntryResult {
  const version = input.legalVersion ?? getLegalVersionFor(input.effectiveDate);

  const insuranceBase = Math.min(
    input.insuranceBaseSalary,
    version.insuranceCap,
  );

  // BH NLĐ đóng
  const bhxhEmployee = Math.round(insuranceBase * version.employeeBhxhRate);
  const bhytEmployee = Math.round(insuranceBase * version.employeeBhytRate);
  const bhtnEmployee = Math.round(insuranceBase * version.employeeBhtnRate);
  const totalInsuranceEmployee = bhxhEmployee + bhytEmployee + bhtnEmployee;

  // BH NSDLĐ đóng
  const bhxhEmployer = Math.round(insuranceBase * version.employerBhxhRate);
  const bhytEmployer = Math.round(insuranceBase * version.employerBhytRate);
  const bhtnEmployer = Math.round(insuranceBase * version.employerBhtnRate);
  const totalInsuranceEmployer = bhxhEmployer + bhytEmployer + bhtnEmployer;

  // Giảm trừ
  const personalDeduction = version.personalDeduction;
  const dependentDeduction = input.dependentCount * version.dependentDeduction;

  // Thu nhập tính thuế
  const taxableIncome = Math.max(
    0,
    input.grossTotal -
      totalInsuranceEmployee -
      personalDeduction -
      dependentDeduction -
      input.charityDeduction,
  );

  const pitTax = calculatePIT(taxableIncome, version.pitBrackets);

  // Lương thực lĩnh
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
