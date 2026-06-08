import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { fetchStocktakeSessions } from "../actions";
import { fetchReorderAlerts, fetchExpiryAlerts } from "../alert-actions";
import { fetchRecentActivity } from "../grn-actions";
import { getInventoryDashboard } from "../dashboard-actions";
import { formatDate } from "./format";
import { resolveInventoryBranchScope } from "./inventory-scope";

type DashboardSiteKind = "central_warehouse" | "central_kitchen" | "branch";

type DashboardStocktake = {
  id: number;
  status: string;
  total_items?: number | null;
  counted_items?: number | null;
  branches: { id: number; name: string } | null;
};

type DashboardReorder = {
  ingredient_id: number;
  ingredient_name: string;
  current_quantity: number;
  reorder_point: number;
  unit: string;
  branch_id: number;
};

type DashboardExpiry = {
  ingredient_id: number;
  ingredient_name: string;
  batch_number: string | null;
  expiry_date: string;
  days_remaining: number;
  urgency: string;
};

type DashboardActivity = {
  id: number;
  type: "grn" | "invoice";
  code: string;
  supplier: string;
  date: string;
  status: string;
  total: number | null;
};

export type InventoryDashboardData = {
  siteName: string;
  siteKind: DashboardSiteKind;
  userRole: StaffRole;
  showProcurement: boolean;
  selectedBranchId: number | null;
  totalStockValue: number;
  activeStocktakes: number;
  reorderAlerts: Array<{
    ingredientId: number;
    branchId: number;
    name: string;
    current: number;
    reorder: number;
    unit: string;
  }>;
  expiryAlerts: Array<{
    id: number;
    ingredientName: string;
    lot: string;
    expiryDate: string;
    daysLeft: number;
    urgency: string;
  }>;
  stocktakeSessions: Array<{
    id: number;
    code: string;
    branchName: string;
    progress: number;
    status: string;
  }>;
  recentActivity: Array<{
    id: number;
    type: "grn" | "invoice";
    code: string;
    supplier: string;
    date: string;
    status: string;
    total: number | null;
  }>;
};

export async function loadInventoryDashboardData(
  requestedBranchId: number | null,
): Promise<InventoryDashboardData> {
  const { supabase, claims } = await loadAuthState();

  const isOversightRole =
    claims.user_role === "owner" || claims.user_role === "manager";
  const procurementSyncOk =
    !isOversightRole && canAccess(claims.user_role, "inventory_procurement");

  const [procurementAsync, scope] = await Promise.all([
    procurementSyncOk
      ? currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ)
      : Promise.resolve(false),
    resolveInventoryBranchScope(supabase, claims, requestedBranchId),
  ]);

  const showProcurement = procurementSyncOk && procurementAsync;

  const selectedBranch = scope.allowedBranches.find(
    (b) => b.id === scope.selectedBranchId,
  );

  // HKD lean: HQ/warehouse default applies to owner/manager only. The former
  // "office" arm collapsed into "staff", which also covers branch staff
  // (cashier/waiter) — so it is dropped here to avoid defaulting every staff
  // user to the central-warehouse view (this is a display fallback, not access).
  const isHqDefaultRole =
    claims.user_role === "manager" || claims.user_role === "owner";
  const siteName =
    selectedBranch?.name ?? (isHqDefaultRole ? "Kho tổng" : "Điểm vận hành");
  const siteKindRaw =
    selectedBranch?.branch_kind ??
    (isHqDefaultRole ? "central_warehouse" : "branch");
  const siteKind: DashboardSiteKind =
    siteKindRaw === "central_kitchen"
      ? "central_kitchen"
      : siteKindRaw === "central_warehouse"
        ? "central_warehouse"
        : "branch";

  const branchFilter = scope.selectedBranchId ?? undefined;

  const [dashboardRes, stocktakeRes, reorderRes, expiryRes, activityRes] =
    await Promise.all([
      scope.selectedBranchId != null
        ? getInventoryDashboard(scope.selectedBranchId)
        : Promise.resolve(null),
      fetchStocktakeSessions(branchFilter),
      fetchReorderAlerts(branchFilter),
      fetchExpiryAlerts(branchFilter),
      showProcurement
        ? fetchRecentActivity(branchFilter)
        : Promise.resolve(null),
    ]);

  const totalStockValue =
    dashboardRes != null && dashboardRes.success && dashboardRes.data
      ? (dashboardRes.data.summary.totalValueVnd ?? 0)
      : 0;

  const rawSessions: DashboardStocktake[] =
    stocktakeRes.success && stocktakeRes.data
      ? (stocktakeRes.data as DashboardStocktake[])
      : [];
  const activeStocktakes = rawSessions.filter(
    (s) => s.status === "in_progress",
  ).length;
  const stocktakeSessions = rawSessions.map((s) => {
    const totalItems = Number(s.total_items ?? 0);
    const countedItems = Number(s.counted_items ?? 0);
    const progress =
      totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;

    return {
      id: s.id,
      code: `ST-${String(s.id)}`,
      branchName: s.branches?.name ?? "",
      progress,
      status: s.status,
    };
  });

  const reorderAlerts: InventoryDashboardData["reorderAlerts"] =
    reorderRes.success && reorderRes.data
      ? (reorderRes.data as DashboardReorder[]).map((r) => ({
          ingredientId: r.ingredient_id,
          branchId: r.branch_id,
          name: r.ingredient_name,
          current: r.current_quantity,
          reorder: r.reorder_point,
          unit: r.unit,
        }))
      : [];

  const expiryAlerts: InventoryDashboardData["expiryAlerts"] =
    expiryRes.success && expiryRes.data
      ? (expiryRes.data as DashboardExpiry[]).map((e, idx) => ({
          id: e.ingredient_id * 1000 + idx,
          ingredientName: e.ingredient_name,
          lot: e.batch_number ?? "",
          expiryDate: formatDate(e.expiry_date),
          daysLeft: e.days_remaining,
          urgency: e.urgency,
        }))
      : [];

  const recentActivity: InventoryDashboardData["recentActivity"] =
    activityRes != null && activityRes.success && activityRes.data
      ? (activityRes.data as DashboardActivity[]).map((a) => ({
          id: a.id,
          type: a.type,
          code: a.code,
          supplier: a.supplier,
          date: a.date,
          status: a.status,
          total: a.total,
        }))
      : [];

  return {
    siteName,
    siteKind,
    userRole: claims.user_role,
    showProcurement,
    selectedBranchId: scope.selectedBranchId,
    totalStockValue,
    activeStocktakes,
    reorderAlerts,
    expiryAlerts,
    stocktakeSessions,
    recentActivity,
  };
}
