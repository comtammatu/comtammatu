export interface PayrollEntryRow {
  id: number;
  employee_id: number;
  working_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  payable_days: number;
  standard_days: number;
  base_salary: number;
  gross_total: number;
  total_insurance_employee: number;
  total_insurance_employer: number;
  insurance_base: number;
  personal_deduction: number;
  dependent_count: number;
  dependent_deduction: number;
  taxable_income: number;
  pit_tax: number;
  advance_deduction: number;
  other_deductions: number;
  net_salary: number;
  employees: {
    id: number;
    employee_code: string | null;
    profiles: { full_name: string } | null;
  } | null;
}

export interface PayrollPeriodDetail {
  id: number;
  period_month: number;
  period_year: number;
  standard_days: number;
  status: string;
  approved_at: string | null;
  paid_at: string | null;
}
