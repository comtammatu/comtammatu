import type { StaffRole } from "@comtammatu/shared/auth";
import { getAuthContext } from "@/admin/_lib/auth";
import {
  fetchDashboardStats,
  type DashboardStats,
} from "@/admin/dashboard/actions";

const ADMIN_ALLOWED_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

export interface BetaAdminSummary {
  stats: DashboardStats;
  branchCount: number;
  staffCount: number;
}

export async function loadBetaAdminSummary(): Promise<BetaAdminSummary> {
  const stats = await fetchDashboardStats();
  const ctx = await getAuthContext(ADMIN_ALLOWED_ROLES);

  if (!ctx) {
    return {
      stats,
      branchCount: 0,
      staffCount: 0,
    };
  }

  const { supabase, claims } = ctx;
  const branchFilter = claims.branch_id !== null ? claims.branch_id : undefined;

  let branchQuery = supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id);

  if (branchFilter !== undefined) {
    branchQuery = branchQuery.eq("id", branchFilter);
  }

  let staffQuery = supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id);

  if (branchFilter !== undefined) {
    staffQuery = staffQuery.eq("branch_id", branchFilter);
  }

  const [branchResult, staffResult] = await Promise.all([
    branchQuery,
    staffQuery,
  ]);

  return {
    stats,
    branchCount: branchResult.count ?? 0,
    staffCount: staffResult.count ?? 0,
  };
}
