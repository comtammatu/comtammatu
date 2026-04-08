import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaims,
  getInventoryValueVisibility,
} from "@comtammatu/shared/auth";
import { fetchIngredients } from "./actions";
import { InventoryClient } from "./inventory-client";

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const claims = user ? extractClaims(user.app_metadata) : null;

  const inventoryValueVisibility = claims
    ? getInventoryValueVisibility(claims.user_role)
    : { system: false, area: false, branch: false };

  // Fetch ingredients and branches in parallel
  const [ingredientsResult, branchesRes] = await Promise.all([
    fetchIngredients(),
    supabase
      .from("branches")
      .select("id, name, is_active")
      .order("is_headquarters", { ascending: false })
      .order("name"),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kho hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý nguyên liệu và mức tồn kho theo chi nhánh
        </p>
      </div>

      <InventoryClient
        ingredients={ingredients}
        branches={branches}
        defaultBranchId={defaultBranchId}
        inventoryValueVisibility={inventoryValueVisibility}
        canManageIngredientCatalog={canManageIngredientCatalog}
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
