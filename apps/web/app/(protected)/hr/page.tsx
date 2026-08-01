import { Suspense } from "react";
import {
  PERMISSION_KEYS,
  staffRoleFromPositionCode,
} from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { fetchEmployees } from "./actions";
import { fetchHrAttentionSummary } from "./hr-attention";
import { HrClient } from "./hr-client";
import { loadStaffAccountsData } from "./staff/load-staff-accounts";
import type { BranchOption, EmployeeRow } from "./_types";

type HrSearchParams = {
  salary?: string;
  view?: string;
  position?: string;
  branch?: string;
  status?: string;
  q?: string;
};

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<HrSearchParams>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const canManageAccounts = await probePermission(
    { supabase, claims },
    PERMISSION_KEYS.AUTH_BINDING_READ,
  );
  const initialView =
    params.view === "accounts" && canManageAccounts ? "accounts" : "profile";

  const [
    branchesResult,
    employeesResult,
    positionsResult,
    attention,
    staffData,
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    initialView === "profile"
      ? fetchEmployees(params.branch)
      : Promise.resolve({ success: true as const, data: [] }),
    initialView === "profile"
      ? supabase
          .from("positions")
          .select("code, label_vi")
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .order("label_vi")
      : Promise.resolve({ data: [] }),
    initialView === "profile"
      ? fetchHrAttentionSummary(supabase, claims.tenant_id)
      : Promise.resolve({ pendingApprovals: 0, missingContractOrSalary: 0 }),
    initialView === "accounts" && canManageAccounts
      ? loadStaffAccountsData(supabase, {
          position: params.position,
          branch: params.branch,
          status: params.status,
          q: params.q,
        })
      : Promise.resolve(null),
  ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];
  const branches = (branchesResult.data ?? []) as BranchOption[];
  const positionOptions = (positionsResult.data ?? []).flatMap((position) => {
    const role = staffRoleFromPositionCode(position.code);
    if (role === "owner" || position.code === "archived_staff") {
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
    <Suspense>
      <HrClient
        employees={employees}
        branches={branches}
        positionOptions={positionOptions}
        attention={attention}
        initialSalaryFilter={initialSalaryFilter}
        initialView={initialView}
        canManageAccounts={canManageAccounts}
        staff={staffData?.staff}
        staffBranches={staffData?.branches}
        staffPositionOptions={staffData?.positionOptions}
        staffHasActiveFilters={staffData?.hasActiveFilters}
        initialScope={params.branch}
      />
    </Suspense>
  );
}
