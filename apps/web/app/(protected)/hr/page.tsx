import { Suspense } from "react";
import {
  PERMISSION_KEYS,
  isOwnerPositionCode,
} from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { getVNDateString } from "@comtammatu/shared/time";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { fetchEmployees } from "./actions";
import { fetchHrAttentionSummary } from "./hr-attention";
import { HrClient } from "./hr-client";
import { loadStaffAccountsData } from "./staff/load-staff-accounts";
import type {
  BranchOption,
  EmployeeRow,
  EmployeeShiftOption,
  EmployeeTodayShiftAssignment,
} from "./_types";
import { resolveHrBranchScope } from "@/lib/hr-scope";
import {
  fetchPositionTasksData,
  type PositionTasksData,
} from "./position-tasks-actions";

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
  const requestedScope = resolveHrBranchScope(params.branch);
  const authContext = { supabase, claims };
  const [
    canManageAccounts,
    canManageEmployees,
    canAssignShift,
    canManageTasks,
  ] = await Promise.all([
    probePermission(authContext, PERMISSION_KEYS.AUTH_BINDING_READ),
    probePermission(authContext, PERMISSION_KEYS.HR_MANAGE_EMPLOYEE),
    probePermission(authContext, PERMISSION_KEYS.HR_ASSIGN_SHIFT),
    probePermission(authContext, PERMISSION_KEYS.HR_MANAGE_POSITION_TASKS),
  ]);
  const initialView =
    params.view === "accounts" && canManageAccounts ? "accounts" : "profile";
  const canQuickAssignShift = canAssignShift && claims.user_role === "owner";
  const branchesResult = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  const branches = (branchesResult.data ?? []) as BranchOption[];
  const branchScope = resolveHrBranchScope(requestedScope, branches);

  const today = getVNDateString();
  const [
    employeesResult,
    positionsResult,
    attention,
    staffData,
    shiftsResult,
    todayAssignmentsResult,
    positionTasksResult,
  ] = await Promise.all([
    initialView === "profile" ||
    (initialView === "accounts" && canManageAccounts)
      ? fetchEmployees(branchScope)
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
      ? fetchHrAttentionSummary(supabase, claims.tenant_id, branchScope)
      : Promise.resolve({ pendingApprovals: 0, missingContractOrSalary: 0 }),
    initialView === "accounts" && canManageAccounts
      ? loadStaffAccountsData(supabase, {
          position: params.position,
          branch: branchScope,
          status: params.status,
          q: params.q,
        })
      : Promise.resolve(null),
    initialView === "profile" && canQuickAssignShift
      ? supabase
          .from("shifts")
          .select("id, name, start_time, end_time")
          .eq("tenant_id", claims.tenant_id)
          .is("branch_id", null)
          .eq("is_active", true)
          .order("start_time")
      : Promise.resolve({ data: [] }),
    initialView === "profile" && canQuickAssignShift
      ? supabase
          .from("shift_assignments")
          .select("employee_id, shift_id")
          .eq("tenant_id", claims.tenant_id)
          .eq("work_date", today)
          .not("shift_id", "is", null)
      : Promise.resolve({ data: [] }),
    initialView === "profile" && canManageTasks
      ? fetchPositionTasksData()
      : Promise.resolve({ success: true as const, data: null }),
  ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];
  const positionOptions = (positionsResult.data ?? []).flatMap((position) => {
    if (
      isOwnerPositionCode(position.code) ||
      position.code === "archived_staff"
    ) {
      return [];
    }
    return [
      { value: position.code, label: position.label_vi ?? UNKNOWN_LABEL_VI },
    ];
  });
  const shifts = (shiftsResult.data ?? []) as EmployeeShiftOption[];
  const todayAssignments = (todayAssignmentsResult.data ??
    []) as EmployeeTodayShiftAssignment[];
  const positionTasksData = positionTasksResult.success
    ? ((positionTasksResult.data as PositionTasksData | null) ?? null)
    : null;
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
        canManageEmployees={canManageEmployees}
        canAssignShift={canQuickAssignShift}
        canManageTasks={canManageTasks}
        shifts={shifts}
        todayAssignments={todayAssignments}
        positionTasksData={positionTasksData}
        staff={staffData?.staff}
        staffBranches={staffData?.branches}
        staffPositionOptions={staffData?.positionOptions}
        staffHasActiveFilters={staffData?.hasActiveFilters}
        initialScope={branchScope}
      />
    </Suspense>
  );
}
