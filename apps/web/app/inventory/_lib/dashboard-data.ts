import { createClient } from "@comtammatu/database/supabase/server";
import { canAccess, extractClaims } from "@comtammatu/shared/auth";
import {
  fetchReorderAlerts,
  fetchExpiryAlerts,
  fetchStocktakeSessions,
} from "../actions";
import { fetchPurchaseOrders } from "../procurement-actions";
import { fetchStockTransfers } from "../transfer-actions";
import { fetchInventoryValueSystem } from "../inventory-value-actions";
import { formatDate } from "./format";
import { fetchInventorySiteContext } from "./procurement-branches";

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

export async function loadInventoryDashboardData(): Promise<InventoryDashboardData> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const showProcurement = claims
    ? canAccess(claims.user_role, "inventory_procurement")
    : false;

  const siteContext = claims
    ? await fetchInventorySiteContext(
        supabase,
        claims.tenant_id,
        claims.branch_id,
      )
    : null;

  const resolvedSiteContext =
    siteContext ??
    (claims?.user_role === "super_manager" ||
    claims?.user_role === "owner" ||
    claims?.user_role === "office"
      ? {
          branchName: "Kho tổng",
          branchKind: "central_warehouse" as const,
        }
      : {
          branchName: "Điểm vận hành",
          branchKind: "branch" as const,
        });

  const [valueRes, poRes, transferRes, stocktakeRes, reorderRes, expiryRes] =
    await Promise.all([
      fetchInventoryValueSystem(),
      fetchPurchaseOrders(),
      fetchStockTransfers(),
      fetchStocktakeSessions(),
      fetchReorderAlerts(),
      fetchExpiryAlerts(),
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
    (t) => t.status === "in_transit" || t.status === "confirmed",
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
    siteName: resolvedSiteContext.branchName,
    siteKind: resolvedSiteContext.branchKind as DashboardSiteKind,
    showProcurement,
    totalStockValue,
    pendingPO,
    activeTransfers,
    activeStocktakes,
    reorderAlerts,
    expiryAlerts,
    transfers,
    stocktakeSessions,
  };
}
