import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import {
  fetchReorderAlerts,
  fetchExpiryAlerts,
  fetchStocktakeSessions,
} from "../actions";
import { fetchPurchaseOrders } from "../procurement-actions";
import { fetchStockTransfers } from "../transfer-actions";
import { fetchInventoryValueSystem } from "../inventory-value-actions";
import { formatDate } from "./format";
import { resolveInventoryBranchScope } from "./inventory-scope";

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
  showProcurement: boolean;
  totalStockValue: number;
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  priceReviewCount: number;
  pendingSupplierReturns: number;
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

  const showProcurement =
    canAccess(claims.user_role, "inventory_procurement") &&
    (await currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ));

  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    requestedBranchId,
  );

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

  const [valueRes, poRes, transferRes, stocktakeRes, reorderRes, expiryRes] =
    await Promise.all([
      fetchInventoryValueSystem(branchFilter),
      fetchPurchaseOrders(branchFilter),
      fetchStockTransfers(branchFilter),
      fetchStocktakeSessions(branchFilter),
      fetchReorderAlerts(branchFilter),
      fetchExpiryAlerts(branchFilter),
    ]);

  const totalStockValue =
    valueRes.success && valueRes.data ? valueRes.data.totalValue : 0;

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

  // Real counts for KPI strip (replaces previous hardcoded zeros).
  const [priceReviewCount, pendingSupplierReturns] = await Promise.all([
    showProcurement
      ? fetchPriceReviewCount(supabase, claims.tenant_id, branchFilter)
      : 0,
    showProcurement
      ? fetchPendingSupplierReturnCount(supabase, claims.tenant_id, branchFilter)
      : 0,
  ]);

  return {
    siteName,
    siteKind,
    showProcurement,
    totalStockValue,
    pendingPO,
    activeTransfers,
    activeStocktakes,
    priceReviewCount,
    pendingSupplierReturns,
    reorderAlerts,
    expiryAlerts,
    transfers,
    stocktakeSessions,
  };
}

const PRICE_VARIANCE_THRESHOLD_PCT = 5;

async function fetchPriceReviewCount(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
  tenantId: number,
  branchId: number | undefined,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  let query = supabase
    .from("grn_items")
    .select(
      "baseline_variance_pct, goods_received_notes!inner ( branch_id, status, received_date )",
    )
    .eq("tenant_id", tenantId)
    .eq("goods_received_notes.status", "confirmed")
    .gte("goods_received_notes.received_date", cutoffIso)
    .not("baseline_variance_pct", "is", null);
  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }

  const { data, error } = await query;
  if (error || !data) return 0;
  return data.filter(
    (row) =>
      row.baseline_variance_pct != null &&
      Math.abs(row.baseline_variance_pct) > PRICE_VARIANCE_THRESHOLD_PCT,
  ).length;
}

async function fetchPendingSupplierReturnCount(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
  tenantId: number,
  branchId: number | undefined,
): Promise<number> {
  let query = supabase
    .from("supplier_returns")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["draft", "pending"]);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}
