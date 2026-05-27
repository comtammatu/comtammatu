import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import {
  fetchReorderAlerts,
  fetchExpiryAlerts,
  fetchStocktakeSessions,
} from "../actions";
import { fetchPurchaseOrders } from "../procurement-actions";
import { fetchStockTransfers } from "../transfer-actions";
import { getInventoryDashboard } from "../dashboard-actions";
import { formatDate } from "./format";
import { resolveInventoryBranchScope } from "./inventory-scope";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  PRODUCTION_OPEN_PERMISSIONS,
} from "../production-data";

type DashboardSiteKind = "central_warehouse" | "central_kitchen" | "branch";

type DashboardTransfer = {
  id: number;
  transfer_number: string;
  status: string;
  from_branch_name: string;
  to_branch_name: string;
};

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

export type InventoryDashboardData = {
  siteName: string;
  siteKind: DashboardSiteKind;
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  selectedBranchId: number | null;
  totalStockValue: number;
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  priceReviewCount: number;
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
  transfers: Array<{
    id: number;
    code: string;
    fromBranch: string;
    toBranch: string;
    status: string;
  }>;
  stocktakeSessions: Array<{
    id: number;
    code: string;
    branchName: string;
    progress: number;
    status: string;
  }>;
};

export async function loadInventoryDashboardData(
  requestedBranchId: number | null,
): Promise<InventoryDashboardData> {
  const { supabase, claims } = await loadAuthState();

  // Sync gates first — short-circuit avoids unnecessary RPC fetches when
  // role/permission map already disqualifies the user.
  const isOversightRole =
    claims.user_role === "owner" || claims.user_role === "area_manager";
  const procurementSyncOk =
    !isOversightRole && canAccess(claims.user_role, "inventory_procurement");
  const productionSyncOk =
    claims.user_role !== "owner" &&
    claims.user_role !== "area_manager" &&
    canAccessProductionSurface(claims.user_role);

  // Permission RPCs + branch scope are independent — fan them out in
  // parallel instead of awaiting them serially via &&. Saves 2-3 RTTs
  // on the dashboard's TTFB. resolveInventoryBranchScope only needs
  // {supabase, claims} which are already in scope.
  const [
    procurementAsync,
    productionPermissionAsync,
    productionBranchAsync,
    scope,
  ] = await Promise.all([
    procurementSyncOk
      ? currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ)
      : Promise.resolve(false),
    productionSyncOk
      ? currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS)
      : Promise.resolve(false),
    productionSyncOk
      ? hasCurrentProductionBranchAccess(supabase, claims)
      : Promise.resolve(false),
    resolveInventoryBranchScope(supabase, claims, requestedBranchId),
  ]);

  const showProcurement = procurementSyncOk && procurementAsync;
  const showProduction =
    productionSyncOk && productionPermissionAsync && productionBranchAsync;

  const selectedBranch = scope.allowedBranches.find(
    (b) => b.id === scope.selectedBranchId,
  );

  const siteName =
    selectedBranch?.name ??
    (claims.user_role === "super_manager" ||
    claims.user_role === "owner" ||
    claims.user_role === "office"
      ? "Kho tổng"
      : "Điểm vận hành");
  const siteKindRaw =
    selectedBranch?.branch_kind ??
    (claims.user_role === "super_manager" ||
    claims.user_role === "owner" ||
    claims.user_role === "office"
      ? "central_warehouse"
      : "branch");
  const siteKind: DashboardSiteKind =
    siteKindRaw === "central_kitchen"
      ? "central_kitchen"
      : siteKindRaw === "central_warehouse"
        ? "central_warehouse"
        : "branch";

  const branchFilter = scope.selectedBranchId ?? undefined;

  // Fan out operational queries + MV-backed RPC in parallel.
  // getInventoryDashboard replaces fetchInventoryValueSystem — single RPC
  // instead of a multi-join query — and preserves cost-gated NULL for users
  // lacking reports:view_branch/tenant (rule INVENTORY-WAC-STRICT-OVERRIDE).
  const [
    dashboardRes,
    poRes,
    transferRes,
    stocktakeRes,
    reorderRes,
    expiryRes,
  ] = await Promise.all([
    scope.selectedBranchId != null
      ? getInventoryDashboard(scope.selectedBranchId)
      : Promise.resolve(null),
    fetchPurchaseOrders(branchFilter),
    fetchStockTransfers(branchFilter),
    fetchStocktakeSessions(branchFilter),
    fetchReorderAlerts(branchFilter),
    fetchExpiryAlerts(branchFilter),
  ]);

  // totalStockValue: prefer MV-backed RPC value (cost-gated NULL preserved).
  // Falls back to 0 if branch scope is unresolved or user lacks cost permission.
  const totalStockValue =
    dashboardRes != null && dashboardRes.success && dashboardRes.data
      ? (dashboardRes.data.summary.totalValueVnd ?? 0)
      : 0;

  const pendingPO =
    poRes.success && poRes.data
      ? (poRes.data as Array<{ status: string }>).filter(
          (po) => po.status === "draft" || po.status === "sent",
        ).length
      : 0;

  const rawTransfers: DashboardTransfer[] =
    transferRes.success && transferRes.data
      ? (transferRes.data as DashboardTransfer[])
      : [];
  const activeTransfers = rawTransfers.filter(
    (t) =>
      t.status === "confirmed_ship" ||
      t.status === "in_transit" ||
      t.status === "confirmed_receive",
  ).length;
  const transfers = rawTransfers.map((t) => ({
    id: t.id,
    code: t.transfer_number,
    fromBranch: t.from_branch_name,
    toBranch: t.to_branch_name,
    status: t.status,
  }));

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

  return {
    siteName,
    siteKind,
    userRole: claims.user_role,
    showProcurement,
    showProduction,
    selectedBranchId: scope.selectedBranchId,
    totalStockValue,
    pendingPO,
    activeTransfers,
    activeStocktakes,
    priceReviewCount: 0,
    reorderAlerts,
    expiryAlerts,
    transfers,
    stocktakeSessions,
  };
}
