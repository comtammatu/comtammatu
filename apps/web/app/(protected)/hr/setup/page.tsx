import { Suspense } from "react";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchShifts } from "../actions";
import {
  fetchPositionTasksData,
  type PositionTasksData,
} from "../position-tasks-actions";
import type { ShiftRow } from "../_types";
import { HrSetupClient } from "./setup-client";
import { fetchHrLeavePolicy } from "./leave-policy-actions";
import { loadAuthState } from "@/_lib/auth";
import type { BranchOption } from "../_types";
import { resolveHrBranchScope } from "@/lib/hr-scope";
import type { SetupTab } from "./setup-tab-sync";

const EMPTY_POSITION_TASKS_DATA: PositionTasksData = {
  positions: [],
  ingredients: [],
  tasksByPosition: {},
  employees: [],
  employeeTemplates: [],
};

function resolveSetupTab(value: string | undefined): SetupTab {
  if (value === "shifts" || value === "tasks" || value === "leave") {
    return value;
  }
  return "leave";
}

export default async function HrSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; branch?: string }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const tab = resolveSetupTab(params.tab);
  const [branchesResult, shiftsResult, positionTasksResult, leavePolicyResult] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, branch_kind")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name"),
      tab === "shifts"
        ? fetchShifts()
        : Promise.resolve({ success: true as const, data: [] }),
      tab === "tasks"
        ? fetchPositionTasksData()
        : Promise.resolve({
            success: true as const,
            data: EMPTY_POSITION_TASKS_DATA,
          }),
      tab === "leave"
        ? fetchHrLeavePolicy()
        : Promise.resolve({
            success: true as const,
            data: null,
            isPersisted: false,
          }),
    ]);
  const shifts = shiftsResult.success
    ? ((shiftsResult.data as ShiftRow[]) ?? [])
    : [];
  const positionTasksData =
    (positionTasksResult.success ? positionTasksResult.data : null) ??
    EMPTY_POSITION_TASKS_DATA;
  const copy = messages.hr.client;
  const branches = (branchesResult.data ?? []) as BranchOption[];
  const branchScope = resolveHrBranchScope(params.branch, branches);

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.tabs.setup}
        description={copy.setupDescription}
      />
      <Suspense>
        {/* Remount per tab so server-fetched panel props seed client state. */}
        <HrSetupClient
          key={tab}
          initialShifts={shifts}
          shiftsLoadFailed={tab === "shifts" && !shiftsResult.success}
          positionTasksData={positionTasksData}
          leavePolicy={
            leavePolicyResult.success ? leavePolicyResult.data : null
          }
          leavePolicyPersisted={
            leavePolicyResult.success && leavePolicyResult.isPersisted
          }
          initialTab={tab}
          initialBranchFilter={branchScope}
        />
      </Suspense>
    </AppPage>
  );
}
