"use server";

import { createServiceClient } from "@comtammatu/database/supabase/service";
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

// Mirrors MODULE_ACL.dashboard.allowedRoles: /admin/dashboard is L0 tenant
// command; branch managers use /br/[branchId]/dashboard instead (D017).
const DASHBOARD_ROLES: readonly StaffRole[] = ["owner"];

// Mirrors PrinterStatusBadge: an agent is online when its heartbeat is
// younger than this threshold.
const AGENT_OFFLINE_THRESHOLD_MS = 60_000;

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

export interface BranchOperatingRow {
  branchId: number;
  branchName: string;
  todayRevenue: number;
  paidOrders: number;
  posOpenedAt: string | null;
  printerHasAgent: boolean;
  printerOnline: boolean;
  printerFailed24h: number;
}

/**
 * Live per-branch operating status for the L0 tenant command surface:
 * today's paid orders/revenue, the open POS session, and print-agent
 * health for every active branch. Read-only; every block fails soft to
 * zeros so one broken source never blanks the dashboard.
 *
 * pos_sessions RLS is keyed on `pos:use`, so that single read goes
 * through the service client with an explicit tenant filter; the action
 * itself is role+permission gated to the dashboard audience.
 */
export async function fetchBranchOperatingStatus(): Promise<
  BranchOperatingRow[]
> {
  const ctx = await getAuthContextWithPermission(
    DASHBOARD_ROLES,
    PERMISSION_KEYS.DASHBOARD_VIEW,
  );
  if (!ctx) return [];

  const { supabase, claims } = ctx;
  const todayRange = getVNDayUtcRange(getVNDateString());
  const failedSinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString();
  const service = createServiceClient();

  const [branchesRes, paymentsRes, agentsRes, failedRes, sessionsRes] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("id"),
      supabase
        .from("payments")
        .select("amount, branch_id, orders!inner(status)")
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "completed")
        .not("paid_at", "is", null)
        .neq("orders.status", "cancelled")
        .gte("paid_at", todayRange.startIso)
        .lt("paid_at", todayRange.endIso),
      supabase
        .from("printer_agent_status")
        .select("branch_id, last_seen_at"),
      supabase
        .from("print_jobs")
        .select("branch_id")
        .eq("tenant_id", claims.tenant_id)
        .in("status", ["failed", "expired"])
        .gte("created_at", failedSinceIso),
      service
        .from("pos_sessions")
        .select("branch_id, opened_at")
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "open"),
    ]);

  const revenueByBranch = new Map<number, { revenue: number; orders: number }>();
  for (const row of paymentsRes.data ?? []) {
    const entry = revenueByBranch.get(row.branch_id) ?? {
      revenue: 0,
      orders: 0,
    };
    entry.revenue += Number(row.amount);
    entry.orders += 1;
    revenueByBranch.set(row.branch_id, entry);
  }

  const agentByBranch = new Map<number, string | null>();
  for (const row of agentsRes.data ?? []) {
    if (row.branch_id !== null) {
      agentByBranch.set(row.branch_id, row.last_seen_at);
    }
  }

  const failedByBranch = new Map<number, number>();
  for (const row of failedRes.data ?? []) {
    failedByBranch.set(row.branch_id, (failedByBranch.get(row.branch_id) ?? 0) + 1);
  }

  const sessionByBranch = new Map<number, string>();
  for (const row of sessionsRes.data ?? []) {
    sessionByBranch.set(row.branch_id, row.opened_at);
  }

  return (branchesRes.data ?? []).map((branch) => {
    const sales = revenueByBranch.get(branch.id);
    const lastSeenAt = agentByBranch.get(branch.id) ?? null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      todayRevenue: sales?.revenue ?? 0,
      paidOrders: sales?.orders ?? 0,
      posOpenedAt: sessionByBranch.get(branch.id) ?? null,
      printerHasAgent: lastSeenAt !== null,
      printerOnline:
        lastSeenAt !== null &&
        Date.now() - new Date(lastSeenAt).getTime() <
          AGENT_OFFLINE_THRESHOLD_MS,
      printerFailed24h: failedByBranch.get(branch.id) ?? 0,
    };
  });
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
