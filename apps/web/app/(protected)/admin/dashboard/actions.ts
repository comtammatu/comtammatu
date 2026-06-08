"use server";

import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import {
  addVNDateDays,
  getVNDateString,
  getVNDayUtcRange,
} from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "../_lib/auth";

const DASHBOARD_ROLES: readonly StaffRole[] = ["owner", "manager"];

export interface RecentOrder {
  id: number;
  order_number: string;
  branch_name: string;
  total_amount: number;
  status: string;
  payment_status: string | null;
  created_at: string;
}

export interface DashboardStats {
  todayRevenue: number;
  todayOrders: number;
  yesterdayRevenue: number;
  yesterdayOrders: number;
  avgOrderValue: number;
  recentOrders: RecentOrder[];
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const fallback: DashboardStats = {
    todayRevenue: 0,
    todayOrders: 0,
    yesterdayRevenue: 0,
    yesterdayOrders: 0,
    avgOrderValue: 0,
    recentOrders: [],
  };

  const ctx = await getAuthContextWithPermission(
    DASHBOARD_ROLES,
    PERMISSION_KEYS.DASHBOARD_VIEW,
  );
  if (!ctx) return fallback;

  const { supabase, claims } = ctx;

  const todayDate = getVNDateString();
  const yesterdayDate = addVNDateDays(todayDate, -1);
  const todayRange = getVNDayUtcRange(todayDate);
  const yesterdayRange = getVNDayUtcRange(yesterdayDate);

  // Scope to branch for branch_manager
  const branchFilter = claims.branch_id !== null ? claims.branch_id : undefined;

  let todayQuery = supabase
    .from("payments")
    .select("amount, order_id, orders!inner(status)")
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "completed")
    .not("paid_at", "is", null)
    .neq("orders.status", "cancelled")
    .gte("paid_at", todayRange.startIso)
    .lt("paid_at", todayRange.endIso);

  if (branchFilter !== undefined) {
    todayQuery = todayQuery.eq("branch_id", branchFilter);
  }

  let yesterdayQuery = supabase
    .from("payments")
    .select("amount, order_id, orders!inner(status)")
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "completed")
    .not("paid_at", "is", null)
    .neq("orders.status", "cancelled")
    .gte("paid_at", yesterdayRange.startIso)
    .lt("paid_at", yesterdayRange.endIso);

  if (branchFilter !== undefined) {
    yesterdayQuery = yesterdayQuery.eq("branch_id", branchFilter);
  }

  // Recent orders with branch name
  let recentQuery = supabase
    .from("orders")
    .select(
      "id, order_number, total_amount, status, payment_status, created_at, branches!orders_branch_id_fkey(name)",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (branchFilter !== undefined) {
    recentQuery = recentQuery.eq("branch_id", branchFilter);
  }

  const [todayResult, yesterdayResult, recentResult] = await Promise.all([
    todayQuery,
    yesterdayQuery,
    recentQuery,
  ]);

  const todayRows = todayResult.data ?? [];
  const yesterdayRows = yesterdayResult.data ?? [];
  const recentRows = recentResult.data ?? [];

  const todayRevenue = todayRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const todayOrders = todayRows.length;

  const yesterdayRevenue = yesterdayRows.reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );
  const yesterdayOrders = yesterdayRows.length;

  const avgOrderValue = todayOrders > 0 ? todayRevenue / todayOrders : 0;

  const recentOrders: RecentOrder[] = recentRows.map((r) => {
    // branches is a joined object due to foreign key select
    const branches = r.branches as { name: string } | null;
    return {
      id: r.id,
      order_number: r.order_number,
      branch_name: branches?.name ?? "—",
      total_amount: Number(r.total_amount),
      status: r.status,
      payment_status: r.payment_status,
      created_at: r.created_at,
    };
  });

  return {
    todayRevenue,
    todayOrders,
    yesterdayRevenue,
    yesterdayOrders,
    avgOrderValue,
    recentOrders,
  };
}
