import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { fetchEmployees } from "./actions";
import { HrClient } from "./hr-client";
import type { BranchOption, EmployeeRow } from "./_types";

export default async function HrPage() {
  const { supabase, claims } = await loadAuthState();
  const [employeesResult, branchesResult, positionsResult] = await Promise.all([
      fetchEmployees(),
      supabase
        .from("branches")
        .select("id, name, branch_kind")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("positions")
        .select("code, label_vi")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("label_vi"),
    ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];
  const branches = (branchesResult.data ?? []) as BranchOption[];
  const positionOptions = (positionsResult.data ?? []).flatMap((position) => {
    const role = staffRoleFromPositionCode(position.code);
    if (role === "owner" || role === "unassigned") {
      return [];
    }
    return [
      { value: position.code, label: position.label_vi ?? position.code },
    ];
  });

  return (
    <HrClient
      employees={employees}
      branches={branches}
      positionOptions={positionOptions}
    />
  );
}
