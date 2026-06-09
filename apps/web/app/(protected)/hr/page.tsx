import { fetchEmployees } from "./actions";
import { HrClient } from "./hr-client";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";

export default async function HrPage() {
  const { supabase, claims } = await loadAuthState();
  const canManageEmployees =
    claims.user_role === "owner" || claims.user_role === "super_manager";
  const isBranchManager = claims.user_role === "branch_manager";

  const branchesPromise =
    isBranchManager && claims.branch_id == null
      ? Promise.resolve({ data: [] as BranchOption[] })
      : (() => {
          let query = supabase
            .from("branches")
            .select("id, name")
            .eq("tenant_id", claims.tenant_id)
            .eq("is_active", true)
            .order("name");

          if (isBranchManager && claims.branch_id != null) {
            query = query.eq("id", claims.branch_id);
          }

          return query;
        })();

  const [employeesResult, { data: branches }] = await Promise.all([
    canManageEmployees
      ? fetchEmployees()
      : Promise.resolve({ success: true, data: [] }),
    branchesPromise,
  ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];

  const branchOptions = (branches ?? []) as BranchOption[];

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow="Nhân sự"
        title={isBranchManager ? "Ca và ngày công" : "Nhân sự"}
        description={
          isBranchManager
            ? "Quản lý ca, phân ca và ngày công của chi nhánh được gán."
            : "Nhân viên, ca làm và ngày công cho mô hình Hộ Kinh Doanh."
        }
      />
      <AppSection>
        <HrClient
          employees={employees}
          branches={branchOptions}
          canManageEmployees={canManageEmployees}
        />
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
  future_assignment_count?: number;
}
