import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import { getVNDateStringDaysAgo } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { fetchStocktakeSessions } from "../actions";
import { fetchReorderAlerts } from "../alert-actions";
import { fetchStockTransfers } from "../transfer-actions";
import { getInventoryDashboard } from "../dashboard-actions";
import { resolveInventoryBranchScope } from "./inventory-scope";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  PRODUCTION_OPEN_PERMISSIONS,
} from "../production-data";

type DashboardSiteKind = "branch";

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

export type DashboardWarning =
  | "stockValue"
  | "transfers"
  | "stocktakes"
  | "reorderAlerts"
  | "priceReview"
  | "countSlips";

const OPEN_TRANSFER_STATUSES = new Set([
  "draft",
  "confirmed",
  "confirmed_ship",
  "in_transit",
  "confirmed_receive",
]);

export type InventoryDashboardData = {
  siteName: string;
  siteKind: DashboardSiteKind;
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  canAssignCounts: boolean;
  canApproveCounts: boolean;
  selectedBranchId: number | null;
  canViewStockValue: boolean;
  totalStockValue: number | null;
  dashboardWarnings: DashboardWarning[];
  draftGrns: number;
  activeTransfers: number;
  activeStocktakes: number;
  pendingCountSlips: number;
  priceReviewCount: number;
  reorderAlerts: Array<{
    ingredientId: number;
    branchId: number;
    name: string;
    current: number;
    reorder: number;
    unit: string;
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
  dataAsOf?: string;
};

export async function loadInventoryDashboardData(
  requestedBranchId: number | null,
): Promise<InventoryDashboardData> {
  const { supabase, claims } = await loadAuthState();

  // Sync gates first — short-circuit avoids unnecessary RPC fetches when
  // role/permission map already disqualifies the user.
  const isOwner = claims.user_role === "owner";
  const procurementSyncOk =
    isOwner || canAccess(claims.user_role, "inventory_procurement");
  const productionSyncOk =
    isOwner || canAccessProductionSurface(claims.user_role);

  // Permission RPCs + branch scope are independent — fan them out in
  // parallel instead of awaiting them serially via &&. Saves 2-3 RTTs
  // on the dashboard's TTFB. resolveInventoryBranchScope only needs
  // {supabase, claims} which are already in scope.
  const [
    procurementAsync,
    productionPermissionAsync,
    productionBranchAsync,
    countAssignAsync,
    countApprovalAsync,
    scope,
  ] = await Promise.all([
    procurementSyncOk
      ? isOwner
        ? Promise.resolve(true)
        : currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ)
      : Promise.resolve(false),
    productionSyncOk
      ? isOwner
        ? Promise.resolve(true)
        : currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS)
      : Promise.resolve(false),
    productionSyncOk
      ? hasCurrentProductionBranchAccess(supabase, claims)
      : Promise.resolve(false),
    currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN),
    currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_COUNT_APPROVE),
    resolveInventoryBranchScope(supabase, claims, requestedBranchId),
  ]);

  const showProcurement = isOwner || (procurementSyncOk && procurementAsync);
  const showProduction =
    isOwner ||
    (productionSyncOk && productionPermissionAsync && productionBranchAsync);
  const canAssignCounts = isOwner || countAssignAsync;
  const canApproveCounts = isOwner || countApprovalAsync;

  const selectedBranch = scope.allowedBranches.find(
    (b) => b.id === scope.selectedBranchId,
  );

  const siteName =
    selectedBranch?.name ??
    (claims.user_role === "owner" || claims.user_role === "office"
      ? "Kho hàng"
      : "Điểm vận hành");
  const siteKind: DashboardSiteKind = "branch";

  const branchFilter = scope.selectedBranchId ?? undefined;

  // Fan out operational queries + MV-backed RPC in parallel.
  // getInventoryDashboard replaces fetchInventoryValueSystem — single RPC
  // instead of a multi-join query — and preserves cost-gated NULL for users
  // lacking reports:view_branch/tenant (rule INVENTORY-WAC-STRICT-OVERRIDE).
  // Price-review exception count is only surfaced on the procurement view;
  // skip the query otherwise. Counts confirmed-GRN lines flagged for price
  // review (confirm_goods_receipt_note sets requires_review when the received
  // unit price deviates from the PO price beyond the QC tolerance) within the
  // last 30 days — matching the "(30d)" KPI label and the exception copy.
  const priceReviewSince = getVNDateStringDaysAgo(30);
  let priceReviewQuery = supabase
    .from("grn_items")
    .select("id, goods_received_notes!inner(branch_id, received_date, status)", {
      count: "exact",
      head: true,
    })
    .eq("tenant_id", claims.tenant_id)
    .eq("requires_review", true)
    .eq("goods_received_notes.status", "confirmed")
    .gte("goods_received_notes.received_date", priceReviewSince);
  if (branchFilter !== undefined) {
    priceReviewQuery = priceReviewQuery.eq(
      "goods_received_notes.branch_id",
      branchFilter,
    );
  }

  let pendingCountSlipQuery = supabase
    .from("inventory_count_slips")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "submitted");
  if (branchFilter !== undefined) {
    pendingCountSlipQuery = pendingCountSlipQuery.eq("branch_id", branchFilter);
  }

  let draftGrnQuery = supabase
    .from("goods_received_notes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "draft");
  if (branchFilter !== undefined) {
    draftGrnQuery = draftGrnQuery.eq("branch_id", branchFilter);
  }

  const [
    dashboardRes,
    draftGrnRes,
    transferRes,
    stocktakeRes,
    reorderRes,
    priceReviewRes,
    pendingCountSlipRes,
  ] = await Promise.all([
    scope.selectedBranchId != null
      ? getInventoryDashboard(scope.selectedBranchId)
      : Promise.resolve(null),
    showProcurement
      ? draftGrnQuery
      : Promise.resolve({ count: 0, error: null }),
    fetchStockTransfers(branchFilter),
    fetchStocktakeSessions(branchFilter),
    fetchReorderAlerts(branchFilter),
    showProcurement
      ? priceReviewQuery
      : Promise.resolve({ count: 0, error: null }),
    canApproveCounts
      ? pendingCountSlipQuery
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const dashboardWarnings: DashboardWarning[] = [];
  if (scope.selectedBranchId != null && dashboardRes?.success !== true) {
    dashboardWarnings.push("stockValue");
  }
  if (!transferRes.success) dashboardWarnings.push("transfers");
  if (!stocktakeRes.success) dashboardWarnings.push("stocktakes");
  if (!reorderRes.success) dashboardWarnings.push("reorderAlerts");
  if (priceReviewRes.error) dashboardWarnings.push("priceReview");
  if (pendingCountSlipRes.error) dashboardWarnings.push("countSlips");

  const priceReviewCount = priceReviewRes.error
    ? 0
    : (priceReviewRes.count ?? 0);
  const pendingCountSlips = pendingCountSlipRes.error
    ? 0
    : (pendingCountSlipRes.count ?? 0);
  const draftGrns = draftGrnRes.error ? 0 : (draftGrnRes.count ?? 0);

  const dashboardData =
    dashboardRes != null && dashboardRes.success && dashboardRes.data
      ? dashboardRes.data
      : null;
  const canViewStockValue = dashboardData?.canViewCost === true;
  const totalStockValue = dashboardData?.summary.totalValueVnd ?? null;

  const rawTransfers: DashboardTransfer[] =
    transferRes.success && transferRes.data
      ? (transferRes.data as DashboardTransfer[])
      : [];
  const activeTransfers = rawTransfers.filter(
    (t) => OPEN_TRANSFER_STATUSES.has(t.status),
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

  return {
    siteName,
    siteKind,
    userRole: claims.user_role,
    showProcurement,
    showProduction,
    canAssignCounts,
    canApproveCounts,
    selectedBranchId: scope.selectedBranchId,
    canViewStockValue,
    totalStockValue,
    dashboardWarnings,
    draftGrns,
    activeTransfers,
    activeStocktakes,
    pendingCountSlips,
    priceReviewCount,
    reorderAlerts,
    transfers,
    stocktakeSessions,
    dataAsOf: dashboardData?.computedAt,
  };
}
