import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaims,
  getInventoryValueVisibility,
} from "@comtammatu/shared/auth";
import {
  fetchIngredients,
  fetchReorderAlerts,
  fetchExpiryAlerts,
} from "./actions";
import { InventoryClient } from "./inventory-client";
import { PageHeader } from "@/components/foundation/ui-patterns";

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const inventoryValueVisibility = claims
    ? getInventoryValueVisibility(claims.user_role)
    : { system: false, area: false, branch: false };

  // Fetch ingredients, branches, and alerts in parallel
  const [ingredientsResult, branchesRes, reorderRes, expiryRes] =
    await Promise.all([
      fetchIngredients(),
      supabase
        .from("branches")
        .select("id, name, is_active")
        .order("is_headquarters", { ascending: false })
        .order("name"),
      fetchReorderAlerts(),
      fetchExpiryAlerts(),
    ]);

  const ingredients = ingredientsResult.success
    ? (ingredientsResult.data as IngredientRow[])
    : [];

  const branches: BranchOption[] = (branchesRes.data ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ id: b.id, name: b.name, is_active: true }));

  // For branch_manager, default to their own branch
  const defaultBranchId = claims?.branch_id ?? branches[0]?.id ?? null;

  const canManageIngredientCatalog = claims?.user_role === "super_manager";

  const reorderAlerts: ReorderAlertRow[] = reorderRes.success
    ? ((reorderRes.data as ReorderAlertRow[]) ?? [])
    : [];
  const expiryAlerts: ExpiryAlertRow[] = expiryRes.success
    ? ((expiryRes.data as ExpiryAlertRow[]) ?? [])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan kho"
        description="Quản lý nguyên liệu và mức tồn kho theo chi nhánh"
      />

      <InventoryClient
        ingredients={ingredients}
        branches={branches}
        defaultBranchId={defaultBranchId}
        inventoryValueVisibility={inventoryValueVisibility}
        canManageIngredientCatalog={canManageIngredientCatalog}
        reorderAlerts={reorderAlerts}
        expiryAlerts={expiryAlerts}
      />
    </div>
  );
}

// Re-export type for sibling client components
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
