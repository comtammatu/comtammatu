import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { fetchLeaveRequestRows } from "./leave-request-data";
import type { LeaveRequestRow } from "./leave-request-model";

const LEAVE_APPROVER_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

export type BranchLeaveApprovalData = {
  branchId: number;
  branchName: string;
  canApprove: boolean;
  rows: LeaveRequestRow[];
  loadFailed: boolean;
};

export async function loadBranchLeaveApprovalData(
  routeBranchId: number,
): Promise<BranchLeaveApprovalData> {
  const { supabase, claims } = await loadAuthState();
  const branch = await resolveBranchContext(supabase, claims, routeBranchId);
  if (!branch || branch.branchId !== routeBranchId) notFound();
  // Leave review is store-only; central sites have no leave queue.
  if (branch.branch.branch_kind !== "branch") notFound();

  const canApproveRole = LEAVE_APPROVER_ROLES.includes(claims.user_role);
  const canApprove =
    canApproveRole &&
    (await probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
      routeBranchId,
    ));
  if (!canApprove) {
    return {
      branchId: routeBranchId,
      branchName: branch.branch.name,
      canApprove: false,
      rows: [],
      loadFailed: false,
    };
  }

  const result = await fetchLeaveRequestRows({
    supabase,
    branchId: routeBranchId,
    tenantId: claims.tenant_id,
  });

  return {
    branchId: routeBranchId,
    branchName: branch.branch.name,
    canApprove: true,
    rows: result.success ? result.data : [],
    loadFailed: !result.success,
  };
}
