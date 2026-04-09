/**
 * Payroll Calculation Logic
 *
 * Tính lương + BHXH + thuế TNCN theo luật VN.
 * Ref: docs/ref/payroll-pit.md
 */

/** Mức trần BHXH 2024: 20 × lương cơ sở = 46,800,000 VND */
export const INSURANCE_CAP = 46_800_000;

/** Giảm trừ bản thân: 11,000,000 VND/tháng */
export const PERSONAL_DEDUCTION = 11_000_000;

/** Giảm trừ người phụ thuộc: 4,400,000 VND/người/tháng */
export const DEPENDENT_DEDUCTION = 4_400_000;

/** Tỷ lệ BH phần NLĐ */
export const EMPLOYEE_BHXH_RATE = 0.08;
export const EMPLOYEE_BHYT_RATE = 0.015;
export const EMPLOYEE_BHTN_RATE = 0.01;

/** Tỷ lệ BH phần NSDLĐ */
export const EMPLOYER_BHXH_RATE = 0.175;
export const EMPLOYER_BHYT_RATE = 0.03;
export const EMPLOYER_BHTN_RATE = 0.01;

/**
 * Biểu thuế TNCN lũy tiến 7 bậc (Luật Thuế TNCN 2007, sửa đổi 2012)
 * Công thức tính nhanh: tax = income × rate - deduction
 */
const PIT_BRACKETS = [
  { limit: 5_000_000, rate: 0.05, deduction: 0 },
  { limit: 10_000_000, rate: 0.1, deduction: 250_000 },
  { limit: 18_000_000, rate: 0.15, deduction: 750_000 },
  { limit: 32_000_000, rate: 0.2, deduction: 1_650_000 },
  { limit: 52_000_000, rate: 0.25, deduction: 3_250_000 },
  { limit: 80_000_000, rate: 0.3, deduction: 5_850_000 },
  { limit: Infinity, rate: 0.35, deduction: 9_850_000 },
] as const;

/**
 * Tính thuế TNCN theo biểu lũy tiến 7 bậc
 * @param taxableIncome - Thu nhập tính thuế (sau giảm trừ), VND/tháng
 * @returns Số thuế TNCN phải nộp (rounded)
 */
export function calculatePIT(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;

  for (const bracket of PIT_BRACKETS) {
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
}

/**
 * Tính đầy đủ một dòng payroll cho 1 nhân viên
 */
export function calculatePayrollEntry(
  input: PayrollEntryInput,
): PayrollEntryResult {
  // Apply trần BHXH
  const insuranceBase = Math.min(input.insuranceBaseSalary, INSURANCE_CAP);

  // BH NLĐ đóng
  const bhxhEmployee = Math.round(insuranceBase * EMPLOYEE_BHXH_RATE);
  const bhytEmployee = Math.round(insuranceBase * EMPLOYEE_BHYT_RATE);
  const bhtnEmployee = Math.round(insuranceBase * EMPLOYEE_BHTN_RATE);
  const totalInsuranceEmployee = bhxhEmployee + bhytEmployee + bhtnEmployee;

  // BH NSDLĐ đóng
  const bhxhEmployer = Math.round(insuranceBase * EMPLOYER_BHXH_RATE);
  const bhytEmployer = Math.round(insuranceBase * EMPLOYER_BHYT_RATE);
  const bhtnEmployer = Math.round(insuranceBase * EMPLOYER_BHTN_RATE);
  const totalInsuranceEmployer = bhxhEmployer + bhytEmployer + bhtnEmployer;

  // Giảm trừ
  const personalDeduction = PERSONAL_DEDUCTION;
  const dependentDeduction = input.dependentCount * DEPENDENT_DEDUCTION;

  // Thu nhập tính thuế = gross - BH NLĐ - giảm trừ bản thân - giảm trừ NP thuộc - từ thiện
  const taxableIncome = Math.max(
    0,
    input.grossTotal -
      totalInsuranceEmployee -
      personalDeduction -
      dependentDeduction -
      input.charityDeduction,
  );

  const pitTax = calculatePIT(taxableIncome);

  // Lương thực lĩnh = gross + phụ cấp miễn thuế - BH NLĐ - PIT - tạm ứng - khấu trừ khác
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
  };
}
