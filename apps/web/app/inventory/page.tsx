import {
  fetchReorderAlerts,
  fetchExpiryAlerts,
  fetchStocktakeSessions,
} from "./actions";
import { fetchPurchaseOrders } from "./procurement-actions";
import { fetchStockTransfers } from "./transfer-actions";
import { fetchInventoryValueSystem } from "./inventory-value-actions";
import { formatDate } from "./_lib/format";
import { DashboardClient } from "./dashboard-client";
import type { DashboardProps } from "./dashboard-client";

export default async function DashboardPage() {
  const [valueRes, poRes, transferRes, stocktakeRes, reorderRes, expiryRes] =
    await Promise.all([
      fetchInventoryValueSystem(),
      fetchPurchaseOrders(),
      fetchStockTransfers(),
      fetchStocktakeSessions(),
      fetchReorderAlerts(),
      fetchExpiryAlerts(),
    ]);

  // --- Map to UI shapes ---

  const totalStockValue =
    valueRes.success && valueRes.data ? valueRes.data.totalValue : 0;

  const pendingPO =
    poRes.success && poRes.data
      ? (poRes.data as Array<{ status: string }>).filter(
          (po) => po.status === "draft" || po.status === "sent",
        ).length
      : 0;

  type TransferRow = {
    id: number;
    transfer_number: string;
    status: string;
    from_branch_name: string;
    to_branch_name: string;
  };
  const rawTransfers: TransferRow[] =
    transferRes.success && transferRes.data
      ? (transferRes.data as TransferRow[])
      : [];
  const activeTransfers = rawTransfers.filter(
    (t) => t.status === "in_transit" || t.status === "confirmed",
  ).length;
  const transfers: DashboardProps["transfers"] = rawTransfers.map((t) => ({
    id: t.id,
    code: t.transfer_number,
    fromBranch: t.from_branch_name,
    toBranch: t.to_branch_name,
    status: t.status,
  }));

  type StocktakeRow = {
    id: number;
    status: string;
    branches: { id: number; name: string } | null;
  };
  const rawSessions: StocktakeRow[] =
    stocktakeRes.success && stocktakeRes.data
      ? (stocktakeRes.data as StocktakeRow[])
      : [];
  const activeStocktakes = rawSessions.filter(
    (s) => s.status === "in_progress",
  ).length;
  const stocktakeSessions: DashboardProps["stocktakeSessions"] =
    rawSessions.map((s) => ({
      id: s.id,
      code: `ST-${String(s.id)}`,
      branchName: s.branches?.name ?? "",
      progress: 0, // Real progress would need stocktake_lines query
      status: s.status,
    }));

  type ReorderRow = {
    ingredient_name: string;
    current_quantity: number;
    reorder_point: number;
    unit: string;
  };
  const reorderAlerts: DashboardProps["reorderAlerts"] =
    reorderRes.success && reorderRes.data
      ? (reorderRes.data as ReorderRow[]).map((r) => ({
          name: r.ingredient_name,
          current: r.current_quantity,
          reorder: r.reorder_point,
          unit: r.unit,
        }))
      : [];

  type ExpiryRow = {
    ingredient_id: number;
    ingredient_name: string;
    batch_number: string | null;
    expiry_date: string;
    days_remaining: number;
    urgency: string;
  };
  const expiryAlerts: DashboardProps["expiryAlerts"] =
    expiryRes.success && expiryRes.data
      ? (expiryRes.data as ExpiryRow[]).map((e, idx) => ({
          id: e.ingredient_id * 1000 + idx,
          ingredientName: e.ingredient_name,
          lot: e.batch_number ?? "",
          expiryDate: formatDate(e.expiry_date),
          daysLeft: e.days_remaining,
          urgency: e.urgency,
        }))
      : [];

  return (
    <DashboardClient
      totalStockValue={totalStockValue}
      pendingPO={pendingPO}
      activeTransfers={activeTransfers}
      activeStocktakes={activeStocktakes}
      reorderAlerts={reorderAlerts}
      expiryAlerts={expiryAlerts}
      transfers={transfers}
      stocktakeSessions={stocktakeSessions}
    />
  );
}
