import { fetchEmployees } from "./actions";
import { fetchPositionTasksData } from "./position-tasks-actions";
import type { PositionTasksData } from "./position-tasks-actions";
import { HrClient } from "./hr-client";
import type { BranchOption, EmployeeRow } from "./_types";
import { loadAuthState } from "@/_lib/auth";

const EMPTY_POSITION_TASKS_DATA: PositionTasksData = {
  positions: [],
  ingredients: [],
  tasksByPosition: {},
};

export default async function HrPage() {
  const { supabase, claims } = await loadAuthState();
  const canManageEmployees = claims.user_role === "owner";
  const isBranchManager = claims.user_role === "branch_manager";
  const canViewEmployees = canManageEmployees || isBranchManager;

  const branchesPromise =
    isBranchManager && claims.branch_id == null
      ? Promise.resolve({ data: [] as BranchOption[] })
      : (() => {
          let query = supabase
            .from("branches")
            .select("id, name, branch_kind")
            .eq("tenant_id", claims.tenant_id)
            .eq("is_active", true)
            .order("name");

          if (isBranchManager && claims.branch_id != null) {
            query = query.eq("id", claims.branch_id);
          }

          return query;
        })();

  const [employeesResult, positionTasksResult, { data: branches }] =
    await Promise.all([
      canViewEmployees
        ? fetchEmployees()
        : Promise.resolve({ success: true, data: [] }),
      canManageEmployees
        ? fetchPositionTasksData()
        : Promise.resolve({
            success: true as const,
            data: EMPTY_POSITION_TASKS_DATA,
          }),
      branchesPromise,
    ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];

  const branchOptions = (branches ?? []) as BranchOption[];
  const positionTasksData =
    (positionTasksResult.success ? positionTasksResult.data : null) ??
    EMPTY_POSITION_TASKS_DATA;

  return (
    <HrClient
      employees={employees}
      branches={branchOptions}
      isBranchManager={isBranchManager}
      canManageEmployees={canManageEmployees}
      canViewEmployees={canViewEmployees}
      positionTasksData={positionTasksData}
    />
  );
}
