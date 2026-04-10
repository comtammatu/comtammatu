import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import {
  fetchReorderAlerts,
  fetchExpiryAlerts,
  fetchStocktakeSessions,
} from "./actions";
import { fetchInTransitTransfers } from "./report-actions";
import { InventoryDashboard } from "./inventory-client";
import type { InTransitTransfer } from "./report-actions";

export default async function InventoryPage() {
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

  // Fetch alert + task data in parallel
  const [reorderRes, expiryRes, inTransitRes, stocktakeRes] = await Promise.all(
    [
      fetchReorderAlerts(),
      fetchExpiryAlerts(),
      fetchInTransitTransfers(),
      fetchStocktakeSessions(),
    ],
  );

  const reorderAlerts: ReorderAlertRow[] = reorderRes.success
    ? ((reorderRes.data as ReorderAlertRow[]) ?? [])
    : [];
  const expiryAlerts: ExpiryAlertRow[] = expiryRes.success
    ? ((expiryRes.data as ExpiryAlertRow[]) ?? [])
    : [];
  const inTransitTransfers: InTransitTransfer[] = inTransitRes.success
    ? ((inTransitRes.data as InTransitTransfer[]) ?? [])
    : [];

  // Count in-progress stocktake sessions for task list
  const allStocktakeSessions = stocktakeRes.success
    ? ((stocktakeRes.data ?? []) as Array<{
        id: number;
        status: string;
        branches?: { name: string } | null;
      }>)
    : [];
  const activeStocktakes = allStocktakeSessions.filter(
    (s) => s.status === "in_progress",
  );

  return (
    <InventoryDashboard
      reorderAlerts={reorderAlerts}
      expiryAlerts={expiryAlerts}
      inTransitTransfers={inTransitTransfers}
      activeStocktakes={activeStocktakes.map((s) => ({
        id: s.id,
        branchName: s.branches?.name ?? "—",
      }))}
      showProcurement={showProcurement}
    />
  );
}

// Re-export types for sibling client components
export interface IngredientRow {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost: number | null;
  category: string | null;
  min_stock_level: number;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string;
  shelf_life_days: number | null;
  is_active: boolean;
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean;
}

export interface ReorderAlertRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  current_quantity: number;
  reorder_point: number;
  max_stock_level: number | null;
  suggested_order_qty: number;
  branch_id: number;
  branch_name: string;
}

export interface ExpiryAlertRow {
  ingredient_id: number;
  ingredient_name: string;
  batch_number: string | null;
  expiry_date: string;
  grn_number: string;
  branch_id: number;
  branch_name: string;
  days_remaining: number;
  urgency: "expired" | "critical" | "warning";
}
