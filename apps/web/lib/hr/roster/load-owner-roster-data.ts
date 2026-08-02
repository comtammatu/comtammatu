import "server-only";

import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { loadRosterWeekForPage } from "./actions";
import type { RosterWeekData } from "./roster-model";
import { getVNWeekStartMonday } from "./week";
import type { HrBranchScope } from "@/lib/hr-scope";

export type OwnerRosterPanelData = {
  branchId: number | null;
  weekStart: string;
  roster: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
};

type BranchRow = {
  id: number;
  name: string;
};

function resolveOwnerRosterBranchId(
  rawBranch: Exclude<HrBranchScope, "all">,
  branches: BranchRow[],
): number | null {
  if (rawBranch === "office") return null;
  const parsed = Number(rawBranch);
  if (Number.isInteger(parsed) && parsed > 0) {
    return branches.some((branch) => branch.id === parsed) ? parsed : null;
  }
  return null;
}

export async function loadOwnerRosterPanelData(
  branches: BranchRow[],
  requestedBranch: Exclude<HrBranchScope, "all">,
  requestedWeek?: string,
): Promise<OwnerRosterPanelData> {
  const { supabase, claims } = await loadAuthState();
  const branchId = resolveOwnerRosterBranchId(requestedBranch, branches);
  const weekStart = getVNWeekStartMonday(requestedWeek);
  const canAssign = await probePermission(
    { supabase, claims },
    PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    branchId,
  );

  if (!canAssign) {
    return {
      branchId,
      weekStart,
      roster: {
        employees: [],
        shifts: [],
        assignments: [],
        weeklySchedules: [],
      },
      canAssign: false,
      loadFailed: false,
    };
  }

  const roster = await loadRosterWeekForPage(
    claims.tenant_id,
    branchId,
    weekStart,
  );

  return {
    branchId,
    weekStart,
    roster,
    canAssign: true,
    loadFailed: false,
  };
}
