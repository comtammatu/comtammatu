import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { fetchEmployees } from "./actions";
import { fetchHrAttentionSummary } from "./hr-attention";
import { HrClient } from "./hr-client";
import type { BranchOption, EmployeeRow } from "./_types";

type HrSearchParams = {
  salary?: string;
};

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<HrSearchParams>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const [employeesResult, branchesResult, positionsResult, attention] =
    await Promise.all([
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
      fetchHrAttentionSummary(supabase, claims.tenant_id),
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
      { value: position.code, label: position.label_vi ?? UNKNOWN_LABEL_VI },
    ];
  });
  const initialSalaryFilter =
    params.salary === "missing"
      ? "missing"
      : params.salary === "recorded"
        ? "recorded"
        : "all";

  return (
    <HrClient
      employees={employees}
      branches={branches}
      positionOptions={positionOptions}
      attention={attention}
      initialSalaryFilter={initialSalaryFilter}
    />
  );
}
