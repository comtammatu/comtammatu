import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadRosterWeekForPage } from "./actions";
import type { RosterWeekData } from "./roster-model";
import { getVNWeekStartMonday } from "./week";

const ROSTER_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

export type BranchRosterPageData = {
  branchId: number;
  branchName: string;
  canAssign: boolean;
  weekStart: string;
  roster: RosterWeekData;
  loadFailed: boolean;
};

export async function loadBranchRosterData(
  routeBranchId: number,
  requestedWeekStart?: string,
): Promise<BranchRosterPageData> {
  const { supabase, claims } = await loadAuthState();
  const branch = await resolveBranchContext(supabase, claims, routeBranchId);
  if (!branch || branch.branchId !== routeBranchId) notFound();
  if (branch.branch.branch_kind !== "branch") notFound();

  const canAssignRole = ROSTER_ROLES.includes(claims.user_role);
  const canAssign =
    canAssignRole &&
    (claims.user_role === "owner" ||
      claims.branch_id === routeBranchId) &&
    (await probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_ASSIGN_SHIFT,
      routeBranchId,
    ));

  const weekStart = getVNWeekStartMonday(requestedWeekStart);
  if (!canAssign) {
    return {
      branchId: routeBranchId,
      branchName: branch.branch.name,
      canAssign: false,
      weekStart,
      roster: { employees: [], shifts: [], assignments: [] },
      loadFailed: false,
    };
  }

  try {
    const roster = await loadRosterWeekForPage(
      claims.tenant_id,
      routeBranchId,
      weekStart,
    );
    return {
      branchId: routeBranchId,
      branchName: branch.branch.name,
      canAssign: true,
      weekStart,
      roster,
      loadFailed: false,
    };
  } catch (error) {
    console.error("[hr/roster/load-branch-roster-data] load failed:", error);
    return {
      branchId: routeBranchId,
      branchName: branch.branch.name,
      canAssign: true,
      weekStart,
      roster: { employees: [], shifts: [], assignments: [] },
      loadFailed: true,
    };
  }
}