import { createClient } from "@comtammatu/database/supabase/server";
import { fetchEmployees } from "./actions";
import { HrClient } from "./hr-client";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";

export default async function HrPage() {
  const supabase = await createClient();

  const [employeesResult, { data: branches }] = await Promise.all([
    fetchEmployees(),
    supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];

  const branchOptions = (branches ?? []) as BranchOption[];

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow="Nhân sự"
        title="Nhân sự"
        description="Nhân viên, ca làm và ngày công cho mô hình Hộ Kinh Doanh."
      />
      <AppSection>
        <HrClient employees={employees} branches={branchOptions} />
      </AppSection>
    </AppPage>
  );
}

// Re-export types so client components can share them
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
  profiles: {
    id: string;
    full_name: string;
    phone: string | null;
    role: string;
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
