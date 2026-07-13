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
  const branchesPromise = supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const [employeesResult, positionTasksResult, { data: branches }] =
    await Promise.all([
      fetchEmployees(),
      fetchPositionTasksData(),
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
      positionTasksData={positionTasksData}
    />
  );
}
