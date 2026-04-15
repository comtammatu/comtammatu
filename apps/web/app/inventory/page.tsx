import { DashboardClient } from "./dashboard-client";
import { loadInventoryDashboardData } from "./_lib/dashboard-data";

export default async function InventoryPage() {
  const data = await loadInventoryDashboardData();

  return <DashboardClient routeBase="/inventory" {...data} />;
}

// Re-export types for sibling client components
export interface IngredientRow {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  item_kind: string;
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
  branch_kind?: string | null;
  is_headquarters?: boolean | null;
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
