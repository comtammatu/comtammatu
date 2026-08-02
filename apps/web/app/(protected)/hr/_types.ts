export interface BranchOption {
  id: number;
  name: string;
  branch_kind?: string | null;
}

export interface EmployeeRow {
  id: number;
  employee_code: string | null;
  id_number: string | null;
  bank_account: string | null;
  bank_name: string | null;
  base_salary: number | null;
  insurance_base_salary?: number | null;
  start_date: string | null;
  contract_type: string | null;
  dependents_count: number;
  is_active: boolean;
  default_checklist_template_id: number | null;
  employment_contracts?: {
    id: number;
    contract_number: string;
    signed_date: string;
    start_date: string;
    end_date: string | null;
    gross_salary: number;
    insurance_base_salary: number;
    status: string;
    /** Present after pay_basis migration; UI never shows the raw key. */
    pay_basis?: "attendance_prorated" | "fixed_monthly" | string | null;
  }[];
  profiles: {
    id: string;
    full_name: string;
    phone: string | null;
    positions: {
      code: string | null;
      label_vi: string | null;
      default_checklist_template_id: number | null;
    } | null;
    branch_id: number | null;
    branches: { name: string } | null;
  } | null;
}

export interface ShiftRow {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_opening: boolean;
  is_closing: boolean;
}

export interface EmployeeShiftOption {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
}

export interface EmployeeTodayShiftAssignment {
  employee_id: number;
  shift_id: number;
}
