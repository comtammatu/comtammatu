import { loadAuthState } from "@/_lib/auth";
import { MembersClient } from "./members-client";

export async function TeamMembersContent({ branchId }: { branchId: number }) {
  const { supabase, claims } = await loadAuthState();

  const { data: employeesRes } = await supabase
    .from("employees")
    .select(`
      id,
      employee_code,
      start_date,
      profiles!inner(id, full_name, email, phone)
    `)
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("profiles.branch_id", branchId)
    .order("id");

  const employees = (employeesRes ?? []).map((emp) => {
    const profile = emp.profiles as unknown as {
      id: string;
      full_name: string;
      email: string;
      phone: string;
    };
    return {
      id: emp.id,
      profileId: profile.id,
      name: profile.full_name || "Chưa cập nhật tên",
      code: emp.employee_code,
      email: profile.email,
      phone: profile.phone,
      startDate: emp.start_date,
    };
  });

  return <MembersClient branchId={branchId} employees={employees} />;
}
