import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDateString, getVNMonthString } from "@comtammatu/shared/time";
import { fetchAttendance } from "@/(protected)/hr/actions";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import type { BranchAttendanceRecord } from "./branch-attendance-model";

export type BranchAttendancePageData = {
  branchId: number;
  branchName: string;
  canView: boolean;
  canForceClose: boolean;
  today: string;
  month: string;
  records: BranchAttendanceRecord[];
  loadFailed: boolean;
};

function asAttendanceRecords(value: unknown): BranchAttendanceRecord[] {
  if (!Array.isArray(value)) return [];
  return value as BranchAttendanceRecord[];
}

export async function loadBranchAttendanceData(
  routeBranchId: number,
): Promise<BranchAttendancePageData> {
  const { supabase, claims } = await loadAuthState();
  const branch = await resolveBranchContext(supabase, claims, routeBranchId);
  if (!branch || branch.branchId !== routeBranchId) notFound();
  if (branch.branch.branch_kind !== "branch") notFound();

  const [canView, canForceClose] = await Promise.all([
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
      routeBranchId,
    ),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_FORCE_CLOSE_ATTENDANCE,
      routeBranchId,
    ),
  ]);

  const today = getVNDateString();
  const month = getVNMonthString();

  if (!canView) {
    return {
      branchId: routeBranchId,
      branchName: branch.branch.name,
      canView: false,
      canForceClose: false,
      today,
      month,
      records: [],
      loadFailed: false,
    };
  }

  const result = await fetchAttendance({
    branchId: routeBranchId,
    month,
    day: today,
  });

  return {
    branchId: routeBranchId,
    branchName: branch.branch.name,
    canView: true,
    canForceClose,
    today,
    month,
    records: result.success ? asAttendanceRecords(result.data) : [],
    loadFailed: !result.success,
  };
}
