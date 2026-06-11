"use server";

import {
  canAccess,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import {
  addVNDateDays,
  getVNDateString,
  getVNDayUtcRange,
} from "@comtammatu/shared/time";
import { fetchInventoryValueByBranch } from "@/_actions/inventory";
import { fetchRevenueKpis } from "@/(protected)/finance/actions";
import { fetchFoodCost } from "@/(protected)/finance/accounting-actions";
import { fetchOperatingExpenseTotal } from "@/(protected)/finance/_lib/finance-cockpit";
import { getAuthContextWithPermission } from "../_lib/auth";

const DASHBOARD_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

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

export interface AdminOverviewFinance {
  netRevenueBeforeVat: number;
  ingredientCost: number;
  operatingExpense: number;
  grossProfit: number;
}

export interface AdminOverview {
  finance: AdminOverviewFinance | null;
  inventoryValue: number | null;
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

function toFiniteNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * System-wide overview KPIs for the admin dashboard grid: finance
 * (revenue before VAT, ingredient cost, operating expense, gross profit —
 * same semantics as the finance cockpit) plus current inventory value.
 * Each block is ACL-gated and returns null when the role lacks access;
 * branch_manager numbers are scoped to their branch by the underlying
 * actions.
 */
export async function fetchAdminOverview(): Promise<AdminOverview> {
  const fallback: AdminOverview = { finance: null, inventoryValue: null };

  const ctx = await getAuthContextWithPermission(
    DASHBOARD_ROLES,
    PERMISSION_KEYS.DASHBOARD_VIEW,
  );
  if (!ctx) return fallback;

  const { supabase, claims } = ctx;
  const role = claims.user_role;
  const todayDate = getVNDateString();
  const branchFilter = claims.branch_id !== null ? claims.branch_id : null;
  const hasFinance = canAccess(role, "finance");
  const hasInventory = canAccess(role, "inventory");

  const [kpisRes, foodCostRes, operatingExpense, inventoryRes] =
    await Promise.all([
      hasFinance
        ? fetchRevenueKpis(branchFilter, todayDate, todayDate)
        : Promise.resolve(null),
      hasFinance
        ? fetchFoodCost({
            startDate: todayDate,
            endDate: todayDate,
            ...(branchFilter != null ? { branchId: branchFilter } : {}),
          })
        : Promise.resolve(null),
      hasFinance
        ? fetchOperatingExpenseTotal({
            supabase,
            tenantId: claims.tenant_id,
            branchId: branchFilter,
            startDate: todayDate,
            endDate: todayDate,
          })
        : Promise.resolve(0),
      hasInventory ? fetchInventoryValueByBranch() : Promise.resolve(null),
    ]);

  let finance: AdminOverviewFinance | null = null;
  if (kpisRes?.success) {
    const kpis = kpisRes.data as {
      subtotal_revenue: number | string | null;
      discount_amount: number | string | null;
    } | null;
    const foodCostRows =
      foodCostRes?.success && Array.isArray(foodCostRes.data)
        ? (foodCostRes.data as Array<{
            ingredient_cost: number | string | null;
          }>)
        : [];
    const netRevenueBeforeVat =
      toFiniteNumber(kpis?.subtotal_revenue) -
      toFiniteNumber(kpis?.discount_amount);
    const ingredientCost = foodCostRows.reduce(
      (sum, row) => sum + toFiniteNumber(row.ingredient_cost),
      0,
    );
    finance = {
      netRevenueBeforeVat,
      ingredientCost,
      operatingExpense,
      grossProfit: netRevenueBeforeVat - ingredientCost,
    };
  }

  const inventoryValue = inventoryRes?.success
    ? (inventoryRes.data?.rows ?? []).reduce(
        (sum, row) => sum + row.totalValue,
        0,
      )
    : null;

  return { finance, inventoryValue };
}
