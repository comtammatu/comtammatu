import "server-only";

import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { loadRosterWeekForPage } from "./actions";
import type { RosterWeekData } from "./roster-model";
import type { RosterSiteOption } from "./roster-week-client";
import { getVNWeekStartMonday } from "./week";

export type OwnerRosterPanelData = {
  branchId: number | null;
  weekStart: string;
  roster: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
  siteOptions: RosterSiteOption[];
};

type BranchRow = {
  id: number;
  name: string;
  branch_kind?: string | null;
};

function resolveOwnerRosterBranchId(
  rawBranch: string | undefined,
  branches: BranchRow[],
): number | null {
  if (rawBranch === "office") return null;
  const parsed = Number(rawBranch);
  if (Number.isInteger(parsed) && parsed > 0) {
    return branches.some((branch) => branch.id === parsed) ? parsed : null;
  }
  return branches[0]?.id ?? null;
}

export async function loadOwnerRosterPanelData(
  branches: BranchRow[],
  requestedBranch?: string,
  requestedWeek?: string,
): Promise<OwnerRosterPanelData> {
  const { supabase, claims } = await loadAuthState();
  const storeBranches = branches.filter(
    (branch) => (branch.branch_kind ?? "branch") === "branch",
  );
  const branchId = resolveOwnerRosterBranchId(requestedBranch, storeBranches);
  const weekStart = getVNWeekStartMonday(requestedWeek);
  const siteOptions: RosterSiteOption[] = [
    ...storeBranches.map((branch) => ({
      branchId: branch.id,
      label: branch.name,
    })),
    {
      branchId: null,
      label: messages.hr.roster.officeSiteLabel,
    },
  ];

  const canAssign = await probePermission(
    { supabase, claims },
    PERMISSION_KEYS.HR_ASSIGN_SHIFT,
    branchId,
  );

  if (!canAssign) {
    return {
      branchId,
      weekStart,
      roster: { employees: [], shifts: [], assignments: [] },
      canAssign: false,
      loadFailed: false,
      siteOptions,
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
    siteOptions,
  };
}
