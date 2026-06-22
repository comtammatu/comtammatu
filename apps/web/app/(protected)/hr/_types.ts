export interface BranchOption {
  id: number;
  name: string;
}

export interface EmployeeRow {
  id: number;
  employee_code: string | null;
  id_number: string | null;
  bank_account: string | null;
  bank_name: string | null;
  base_salary: number | null;
  start_date: string | null;
  contract_type: string | null;
  dependents_count: number;
  is_active: boolean;
  default_checklist_template_id: number | null;
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
}
